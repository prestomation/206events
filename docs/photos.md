# Photos in the 206.events data model

206.events carries an optional **photo** for both **events** and **venues**.
The contract is deliberately narrow:

> **Links only.** We store and emit image **URLs** (`imageUrl`), never image
> bytes. Nothing in the pipeline downloads, re-hosts, or base64-inlines an
> image.

The field is named `imageUrl` everywhere — on `RipperCalendarEvent`, on the
serialized event, on every source schema (ripper / external / recurring), on
the `venues.json` venue entry, and as the uncertainty-cache resolution field —
so the "it's a URL, not data" contract is unambiguous.

## Events

- Rippers populate `event.imageUrl` when the source exposes one (Ticketmaster,
  Dice, AXS, Squarespace, Spothopper, and many custom HTML/JSON rippers).
- `toICS()` (`lib/config/schema.ts`) injects two properties per VEVENT that has
  an `imageUrl`:
  - `IMAGE;VALUE=URI` — RFC 7986, for modern calendar clients.
  - `ATTACH;FMTTYPE=<mime>` — broader client support.
  Both are added by a string post-processing pass anchored on `BEGIN:VEVENT`
  (the `ics` library has no native event image support), with MIME derived from
  the URL extension (default `image/jpeg`) and RFC 5545 75-octet line folding.
  Malformed URLs are skipped.
- `events-index.json` carries `imageUrl`, so the web UI shows it on the event
  detail hero, the channel-list row thumbnail, and the map popup.
- External ICS feeds are parsed for an incoming `IMAGE` / image-`ATTACH` so an
  external event's photo round-trips (`extractImageUrl` in
  `lib/tag_aggregator.ts`, mirrored for the web in `web/src/lib/icsImage.js`).

### Event-image backfill

Most image-less events never emit an `UncertaintyError` (that queue is for
unknown start times etc.). Instead, images are backfilled with an **overlay**:
`applyImageBackfill` (`lib/uncertainty-merge.ts`) fills `imageUrl` from the
shared `event-uncertainty-cache.json`, keyed `source:eventId`, for events that
don't already have one. It never overwrites an existing image and skips entries
marked `unresolvable`. See `docs/event-uncertainty.md`.

### Venue-photo display fallback

An event that still has no image after ripper-parse and backfill falls back to
its **venue photo** for display only. `venueImageForCalendar` (`lib/config/
schema.ts`) resolves the calendar/ripper-level `imageUrl`, and it is applied at
the serialization boundaries — the `events-index.json` card and the `toICS`
`IMAGE`/`ATTACH` injection — **not** written onto `event.imageUrl`. Keeping
`event.imageUrl` meaning "the event's own image" is what lets a venue-only event
show a photo (no blank card) while still appearing in the backfill queue below,
so the photo-resolver can later find a real per-event image. Recurring events
carry their own `imageUrl` straight from the recurring YAML.

## Venues

- Venues declare a static `imageUrl` in their source YAML next to `geo:`
  (ripper-level, per-calendar override for multi-branch sources, external, or
  recurring).
- `buildVenuesJson` (`lib/discovery.ts`) emits it on the matching `venues.json`
  entry (calendar-over-ripper precedence, mirroring `geo` inheritance).
- The web UI renders it as a banner on the channel detail page.

## The gap report (work queue)

Every build writes a `photoGaps` + `photoStats` section into
`build-errors.json` (built by `buildPhotoGaps` in `lib/discovery.ts`):

- `photoGaps.venueGaps` — venues with no `imageUrl` (fix via YAML PR).
- `photoGaps.eventGaps` — live ripper events with no **own** `imageUrl` that are
  **not** marked `unresolvable` and whose source does **not** set
  `skipEventPhotos` (fix via the uncertainty cache). The venue-photo display
  fallback is deliberately excluded here, so an event that only shows the venue
  photo stays queued for a real per-event image.
- `photoStats.eventsWithImage` — **display** coverage: counts `events-index`
  entries that render an image, *including* the venue-photo fallback. It is
  intentionally broader than `eventGaps` (the backfill work queue), so a
  venue-only event is both "covered" (shows a photo) and "a gap" (wants its own).
- `photoStats` — `{ eventsWithImage, totalEvents, venuesWithImage, totalVenues,
  unresolvable }`.

**`skipEventPhotos`** (ripper-level YAML boolean, default false) — for a venue
whose events have no harvestable per-event image (the venue photo is the
intended image for every event), set `skipEventPhotos: true` to keep the whole
source out of `eventGaps`. Events still display the venue photo; this just stops
the resolver churning through them as per-event `unresolvable` markings. It is
the source-wide analog of `unresolvable`, and the direct parallel of
`expectEmpty` for zero-event calendars. `sources/seattle_makers/ripper.yaml` is
the reference use.

It is **non-fatal** (not counted in `totalErrors`, like `osmGaps`). The full
list lives directly in `build-errors.json` rather than a separate file — large
on day one, but self-limiting: as photos are found and genuinely-image-less
items are marked `unresolvable`, the queue shrinks to "new events only,"
exactly like the geo and uncertainty backlogs.

Coverage and gap counts are surfaced on all five reporting surfaces (PR
comment, GH step summary, Discord, web HealthDashboard, build-report skill),
per the reporting-parity rule in CLAUDE.md.

## The resolver

`skills/photo-resolver/SKILL.md` reads `photoGaps` as its work queue and
processes a **bounded batch per run**: venue gaps become `imageUrl:` PRs, event
gaps become `--image-url` resolutions in the uncertainty cache (or
`unresolvable` when no image exists). `scripts/photo-gaps.py` prints the
stats/venue/event queues.
