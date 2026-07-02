---
name: "Urban Family Brewing Co."
status: added
platform: custom HTML (Sugar Calendar Lite WordPress plugin)
url: https://urbanfamilybrewing.com/home/calendar/
tags: [Beer, Ballard]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
pr: TBD
---
Ballard taproom (1103 NW 52nd St) hosting a mix of food-truck rotations, trivia nights, yoga, D&D, and one-off shows (e.g. Sofar Sounds). A waterfront location (1022 Alaskan Way) is planned for 2026 but not yet open — this source covers the existing Ballard taproom only.

Investigated 2026-07-02:
- WordPress site using the **Sugar Calendar Lite** plugin (`sugar-calendar-lite` in enqueued asset paths)
- The calendar month-view is server-rendered: each `[data-eventurl]` cell carries `data-eventid` (stable per-occurrence WP post id), `data-calendarsinfo` (JSON naming which of the two site calendars — "Food Truck Calendar" and "Urban Family Brewing Ballard" — the event belongs to), and two `<time datetime="...">` elements for start/end
- 62 events confirmed in the July 2026 month view at time of check (food truck rotation + Yoga in the Brewery, Beginner D&D, First Tuesday Trivia, Sofar Sounds Show, Sour Hour, Square Dancing, World Cup viewing parties, etc.)
- No REST API or query param to page to future months — the ripper surfaces whatever the live "This Month" view shows
- **JS challenge confirmed**: a plain `fetch()` (no browser UA) returns HTTP 202 with an inline redirect to `/.well-known/sgcaptcha/` (SiteGround's bot-challenge page) — same signature documented for other browserbase sources in this repo. A `curl` with a full desktop Chrome User-Agent string does get a real 200, but that's not something the ripper runtime can rely on for CI. Per the JS-challenge exception in AGENTS.md, skipped straight to `proxy: "browserbase"` rather than trying `outofband` first (a plain residential fetch would hit the same challenge)
- Implemented as `sources/urban_family_brewing/` (custom `HTMLRipper`-style ripper, not a base-class subclass — parses the Sugar Calendar cells directly)
- Geo confirmed via Nominatim: 47.6661818, -122.37103 (OSM node 7241641164)
