---
name: setting-resolver
description: Classify venues and events as outdoor / indoor / covered for 206.events weather badges. Reads the settingGaps work queue from build-errors.json and, in bounded batches, writes venue-level (preferred) or per-event setting resolutions into the event-uncertainty-cache, or marks them unresolvable when the setting is genuinely unknowable.
---

# 206.events Setting Resolver

Classify where events happen — `outdoor`, `indoor`, or `covered` (sheltered
but open-air) — so the weather-badge pipeline (`docs/weather-badges.md`) knows
which events to badge. Only `outdoor` events get a forecast badge; a wrong
badge on an indoor event is worse than a missing one, so **classify only what
you can verify**.

The queue covers sources declaring `weatherSetting: "mixed"` in their YAML —
places like a zoo or a parks department whose calendars mix lawn concerts with
indoor lectures. Uniformly open-air sources use the `Outdoors` tag instead and
never appear here.

## The two gap kinds (venue-first!)

| Gap | Cache key | How to fix |
|---|---|---|
| **Venue** setting | `venue:osm:<type>:<id>` (preferred) or `venue:loc:<normalized location>` | One `--setting` resolution classifies every upcoming event at that place, from **all** sources, permanently |
| **Event** setting | `source:eventId` | Per-event `--setting` resolution — only for events with no venue key, or to override a venue default (e.g. the brewery's beer-garden show vs. its indoor taproom) |

**Always prefer the venue gap.** A venue's indoor/outdoor nature is a durable
fact about the place — resolving it once removes every current and future
event there from the queue. The `venueKey` field in each gap entry is the
exact cache key to write.

Precedence at badge time (`resolveEventSetting` in `lib/weather.ts`):
per-event → venue → channel `Outdoors` tag. So a per-event `indoor` can
override an outdoor venue for one event, and vice versa.

## Procedure

1. **Read the queue**: fetch `https://206.events/build-errors.json` and read
   `settingGaps.venueGaps` (each has `venueKey`, `label`, `channels`,
   `eventCount`, and a sample event) and `settingGaps.eventGaps`
   (`source`, `eventId`, `summary`, `date`, `url`).

2. **Work a bounded batch** (~10 venue gaps and ~10 event gaps per run),
   highest `eventCount` first — one popular venue clears many events.

3. **Classify each venue** using, in order of strength:
   - **OpenStreetMap tags** — for `venue:osm:<type>:<id>` keys, fetch
     `https://www.openstreetmap.org/api/0.6/<type>/<id>.json` and read the
     tags. `leisure=park|garden|pitch|playground|dog_park`, `natural=*`,
     `landuse=recreation_ground` → `outdoor`. `building=*` (any value) →
     almost always `indoor` unless the events are plainly on its grounds.
     `amenity=marketplace` open-air → `outdoor`.
   - **The sample event's page** (`sampleUrl`) — event copy often says
     "outdoors", "rain or shine", "indoor arena", etc.
   - **The venue's own website / the location string** — an address suffixed
     "Park", "Trail", "Beach", "Garden" is strong but not conclusive
     (community centers live inside parks — verify).
   - Use `covered` for open-air-but-sheltered spots (pavilions, covered
     markets): they don't get badges today but stay distinguishable from
     `indoor` for future use.

4. **Write resolutions** with the shared CLI (same script as the
   event-uncertainty-resolver):
   ```sh
   # Venue-level (preferred) — key comes verbatim from the gap's venueKey
   python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
     --key "venue:osm:way:247154840" --setting outdoor \
     --evidence "https://www.openstreetmap.org/way/247154840"

   # Per-event
   python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
     --key "events12:duck-parade-2026-06-06" --setting outdoor \
     --evidence "https://www.cityofup.com/418/Duck-Daze"
   ```
   Mark genuinely unknowable items `--unresolvable --reason "..."` so they
   drop off the queue instead of churning every run.

5. **Promote uniform sources.** If investigation shows a mixed source is
   actually 100% open-air, don't write per-venue entries forever — add
   `"Outdoors"` to its `tags:` and remove `weatherSetting: "mixed"` in the
   same PR. Conversely, if a source turns out to be entirely indoor, just
   remove `weatherSetting: "mixed"` (nothing needs classifying).

6. **Open a data-only PR** with the `event-uncertainty-cache.json` changes
   (plus any YAML promotions), following the standard PR workflow in
   AGENTS.md. Cache-only PRs are auto-merge-eligible; YAML tag changes ride
   along fine (calendar content).

## Judgment rubric

- **Never guess from the event title alone** — "Summer Concert" happens in
  ballrooms too. Verify against the venue or event page.
- Rooftop / patio / beer-garden events at otherwise-indoor venues are
  per-event `outdoor` overrides, not venue entries.
- Amphitheaters, sports fields, farmers-market streets, trails: `outdoor`.
- Stadiums with retractable roofs: `covered` (weather still matters less).
- If a venue hosts both regularly and neither dominates, mark the **venue**
  `--unresolvable --reason "mixed indoor/outdoor venue"` — that demotes its
  events to per-event gaps on the next build, and you classify those
  individually instead.

## Self-limiting lifecycle

Resolved venues/events and `unresolvable` markings drop off the queue on the
next build. The queue only contains events starting within the next ~14 days
(`SETTING_GAP_HORIZON_DAYS`), so it tracks real upcoming work, and venue
resolutions accumulate — over time the queue shrinks to only genuinely new
places.
