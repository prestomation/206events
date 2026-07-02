---
name: "Seattle Astronomical Society"
status: added
platform: Custom (Wix sitemap + JSON-LD)
url: https://www.seattleastro.org/events
tags: [Education, Community]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
pr:
---

Amateur astronomy club serving the greater Puget Sound region — monthly
public star parties, board meetings, and member meetups.

Investigated 2026-07-02:

- Wix site; events are JavaScript-loaded (no warmup-state JSON), but each
  event detail page (`/events-1/<slug>`) embeds a Schema.org `Event`
  JSON-LD block with `startDate`, `endDate`, `location.address`, and image.
- A sitemap at `https://www.seattleastro.org/event-pages-sitemap.xml` lists
  all ~270 published event pages (past and future). Event slugs end in a
  `-YYYY-MM-DD-HH-MM` timestamp, so the ripper filters the sitemap to
  future dates before fetching pages, instead of fetching all ~270.
- **The club is regional, not Seattle-focused** — most recurring star
  parties are in Woodinville, Covington, Snoqualmie, Duvall, Bonney Lake,
  and even Goldendale (a dark-sky site ~200mi away). Only three recurring
  event types are physically in Seattle: **Board Meeting** (open to the
  public, hybrid), **Membership Meetup** (Theodor Jacobsen Observatory, UW
  campus), and **Lakewood Playground Star Party** (Rainier Beach). The
  ripper requires an explicit `Seattle, WA` address and drops everything
  else (including the virtual/Zoom `APsig` meetup, which has no address).
- Confirmed live via `ONLY_SOURCE=seattle-astronomical-society npm run
  generate-calendars`: **16 future events, 0 errors** (Board Meeting ×5,
  Membership Meetup ×5, Lakewood Playground Star Party ×6, spanning
  Jul–Dec 2026).
- `geo: null` at the ripper level (three distinct Seattle venues);
  per-event geocoding resolved all three addresses correctly.

`sources/seattle_astronomical_society/`
