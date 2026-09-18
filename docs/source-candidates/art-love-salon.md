---
name: Art Love Salon
status: added
platform: "Custom (Next.js RSC payload on publicdisplay.art, third-party aggregator)"
url: https://artlovesalon.org/events
tags: [Dancing, Arts]
firstSeen: 2026-08-14
lastChecked: 2026-09-18
pr: TBD
---

Seattle salon combining dance, art, and community events.

**Checked 2026-08-14:** Org is real — ArtLove Salon, a zero-commission
gallery/event space at 110 Union St, 5th Floor, Seattle (Conru Art
Foundation initiative), open Tue-Sat 12-4pm. Mentions recurring "Salon
Social" (live music) and "Salon Studio" (workshops) programming. But
no actual event listing with dates was retrievable across three fetch
attempts (`/events`, homepage, `/salon/events`) — pages return nav
chrome and headings only, no populated calendar, suggesting a
JS-rendered widget. Platform not identifiable (no Squarespace/WordPress
markers seen). Needs deeper digging (browser render or finding the real
listing endpoint) before a platform/viability call can be made.

**Implemented 2026-09-18:** Its own site never surfaced a feed, but its
events do appear (alongside dozens of other Seattle arts orgs) on the
citywide aggregator `publicdisplay.art/calendar` — investigated
separately as `docs/source-candidates/publicdisplay-art.md` (still
`investigating`; too broad/high-dedup-risk to implement as a whole
citywide aggregator). That page embeds a Next.js RSC flight payload
containing a clean `initialEvents` array (`org.id: 462` = Art Love
Salon, `org.id: 1` = its parent Conru Foundation, same 110 Union St
building) — 17 real, future, single-day events at time of check
(Salon Social, Salon Studio workshops, Music Soirée, weekly Tai Chi &
Qigong, partner events). The calendar payload's `start_date` is always
midnight (no clock time), but each event's own detail page
(`publicdisplay.art/event/{id}`) carries a clean `hours` field (e.g.
"12:00 PM - 1:00 PM") with the real start/end time — no
`UncertaintyError` needed.

Implemented as `sources/art_love_salon/` (custom `IRipper`: fetch the
calendar page once for the id list, then fetch each candidate event's
own detail page for its time). `sourceRole: venue`, `geo` fixed to 110
Union St (Art Love Salon's own org record: 47.6081894, -122.3388693).
Verified via `ONLY_SOURCE=art-love-salon npm run generate-calendars`:
17 events, 0 errors, 0 cross-source dedup collisions.
