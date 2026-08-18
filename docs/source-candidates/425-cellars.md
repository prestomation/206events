---
name: 425 Cellars Winery
status: notviable
platform: WordPress (The Events Calendar)
url: https://425cellars.com/events/
tags: [Music, Comedy, Wine]
firstSeen: 2026-07-29
lastChecked: 2026-08-18
---

Winery and event venue at 14525 148th Ave NE Suite 211,
**Woodinville, WA 98072**. Regular programming — weekly happy hours with
live musicians, weekend live music, stand-up comedy nights, wine releases.

**Rejected: outside Seattle city limits.** Woodinville is outside the
206.events geographic scope, the same reason recorded for
`woodinville-wine-country.md`, `seattle-thunderbirds.md` (Kent), and
`cougar-mountain-trail-series.md` (Bellevue/Issaquah). Every event in the
feed is at the venue's own fixed Woodinville tasting room, so there is no
Seattle-proper subset to carve out.

**Feed (verified 2026-08-18, for the record):** the site runs WordPress with
The Events Calendar, and `https://425cellars.com/events/?ical=1` is a working
native ICS export — HTTP 200, `text/calendar`, 4 future-dated events (Aug 19
Wine & Bingo Night, Aug 23 and Aug 30 happy hours, Aug 27 live music), each
with a full `LOCATION`. Technically this would be a trivial
`sources/external/` one-liner; it is the geography, not the feed, that rules
it out. If the project's scope ever widens to the Eastside wine corridor,
this is ready to add as-is.

Originally surfaced by the 2026-07-29 social-discovery run (PR #1047, closed
unmerged) via an r/SeattleEvents post:
https://old.reddit.com/r/SeattleEvents/comments/1v8muqq/live_comedy_wednesday_729_425_cellars_woodinville/
That run filed it as `candidate` and did not check it against the
city-limits rule.
