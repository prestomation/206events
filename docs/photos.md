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
- `photoGaps.eventGaps` — live ripper events with no `imageUrl` that are **not**
  marked `unresolvable` (fix via the uncertainty cache).
- `photoStats` — `{ eventsWithImage, totalEvents, venuesWithImage, totalVenues,
  unresolvable }`.

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
