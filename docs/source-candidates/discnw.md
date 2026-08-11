---
name: DiscNW (Northwest Ultimate Association)
status: candidate
platform: Custom HTML
url: https://www.discnw.org/en_us/e
tags: [Sports]
firstSeen: 2026-07-28
lastChecked: 2026-08-11
pr:
---

Regional ultimate frisbee and disc golf governing body running leagues,
tournaments, and camps across Seattle-area venues (e.g. Jackson Park Golf
Course), with some events in Bellevue and other Eastside cities. Runs on
Ultimate Central/TopScore.

No ICS feed or public API discovered despite checking for a widget/JSON
endpoint. Confirmed real upcoming events spanning June-October 2026 (e.g.
"2026 Summer Masters Mixed Hat League", "2026 Fall Mixed Hat League",
"2026 Fall HS Bx Seattle Invite").

🔴 Low confidence — needs custom HTML scraping. The markup is dense with
many auto-generated asset-cache script tags, so parsing will need care to
isolate the `#event-list-*` block. `sourceRole` should likely be
`aggregator` (lists tournaments/leagues across many venues, not one
physical location) with per-event `geo` where a venue is identifiable.

Re-checked 2026-07-29: **correction** — the raw `/en_us/e` page is *not*
server-rendered with event data (that page is just nav/header chrome; the
real list loads via `ts.liveFilter2` client-side JS). However, the
underlying AJAX endpoint IS fetchable without a browser: `GET
/en_us/e/embedded/0/map_size/none` with header `X-Requested-With:
XMLHttpRequest` returns a real flat HTML list — 26 events grouped by month,
each with a title, link, location string ("Seattle, WA" / "Bellevue, WA" /
"North Bend, WA"), and a date range (e.g. "6/1/26 - 8/10/26"). So a static
`HTMLRipper` fetching that AJAX URL directly (with the header) is viable —
no browser rendering needed after all. Individual event detail pages
(`/en_us/e/<slug>`) confirm the same date-range format ("Fri, 4 September
— Fri, 13 November 2026") with no single start/end time, just a season
window — these read more like season-long registration periods than
one-off attendable happenings, which is worth weighing against the
"is this really an event" bar before implementing. Still `status:
candidate` — deprioritized this cycle in favor of Seattle Tech Mixer
(built-in Eventbrite type, PR #1054), a higher-confidence pick per the
"always implement highest-confidence source first" rule.

Re-checked 2026-08-11: confirmed the "is this really an event" concern
is the dominant pattern, not the exception. Fetched the live AJAX
endpoint again — of the ~24 listed items, the large majority are league
registration windows, coaching/volunteer applications, and clinic
sign-ups spanning weeks-to-a-year (e.g. "Application for Eligibility
Review - 2026 to 2027" dated 6/1/26 - 5/31/27), not discrete attendable
happenings. A small minority (e.g. "2026 Fall HS Bx Seattle Invite",
"2026 Fall Gx Middle School Hat Tournament") read like genuine single
tournament events, but distinguishing those from registration windows
programmatically (no structured field differentiates them) adds real
parsing risk on top of the already-flagged custom-scrape effort.
Deprioritized again in favor of a cleaner data source this cycle
(Saltstone Ceramics, PR pending). Left as `candidate` — worth a closer
look at only the small number of genuine one-off tournament pages if
revisited, rather than the full event list.
