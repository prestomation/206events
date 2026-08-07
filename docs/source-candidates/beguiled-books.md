---
name: Beguiled Books
status: added
platform: Custom HTML (Wix)
url: https://www.beguiledbooks.com/events
tags: [Books, Pioneer Square]
firstSeen: 2026-08-06
lastChecked: 2026-08-07
pr: 1127
---

Seattle's newest independent bookstore (opened a physical location fall
2025), romance-genre specialty, 109 1st Ave S, Pioneer Square.

Built on Wix, but the `/events` page is server-rendered — a plain
`curl` fetch returns event titles/dates in the raw HTML ("Bookstore
Romance Day," "Starlight Soiree," author signing slots), not a
JS-only shell. Custom HTML scraping is viable; not a one-off, ongoing
event programming.

**Implemented 2026-08-07:** `sources/beguiled_books/ripper.ts` — the
Wix events widget's listing page server-renders event cards with a
link to a per-event detail page; each detail page embeds a schema.org
Event JSON-LD block with exact `startDate`/`endDate` (no HTML
date/time regex needed). Confirmed 8 real upcoming events (Aug–Oct
2026) at build time. One of the 9 listed events links straight out to
Eventbrite instead of a beguiledbooks.com detail page and is skipped
(no structured start time available from that page). `geo` resolved
via Nominatim (OSM node 2351695471, already tagged `shop=books` as
"Beguiled Books"). `cost` left unset — the site doesn't publish
pricing — so it flows into the `costGaps` queue for the cost-resolver
skill.
