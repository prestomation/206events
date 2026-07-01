---
name: "New Tech Seattle"
status: added
platform: Custom (Meetup.com Next.js Apollo cache)
url: https://www.meetup.com/newtechseattle/events/
tags: ["Tech", "South Lake Union"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
pr:
---

**New Tech Seattle** — `https://www.meetup.com/newtechseattle/events/` — the Northwest's largest ongoing monthly tech networking meetup (60,000+ members), held the second Tuesday of most months at The Collective Seattle, 400 Dexter Ave N, South Lake Union.

Investigated 2026-07-01:
- Meetup group page is server-rendered (Next.js) and embeds a full Apollo GraphQL cache in a `__NEXT_DATA__` script tag; no login/cookies required to read it
- `__APOLLO_STATE__` carries `Event:*` entries with `title`, `dateTime`, `endTime`, `venue` ref, `eventUrl`, and `description` — 12 events confirmed live, scheduled monthly through June 2027
- Venue is consistently "The Collective Seattle, 400 Dexter Ave N" (OSM node `11978458746`) for every occurrence
- **Not a stable "Nth weekday" recurring pattern** — the series metadata says "2nd Tuesday of the month" but the Sept 2026 occurrence is actually the 3rd Tuesday (holiday-week adjustment), confirmed directly in the source data. This is why it's implemented as a custom scraper against real per-event dates rather than `sources/recurring/` — a recurring YAML would have produced the wrong date for that occurrence.
- No built-in ripper type fits (not ICS/Squarespace/Eventbrite/etc.) — implemented as a custom `IRipper` (`sources/new_tech_seattle/ripper.ts`)
- Direct fetch (rung 1, `proxy: false`) succeeded locally; monitor CI for a 403 in case GitHub Actions IPs are blocked

Implemented: `sources/new_tech_seattle/` — 12 events confirmed in a local `ONLY_SOURCE` build, 0 errors.
