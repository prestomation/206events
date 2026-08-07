---
name: Seattle Cocktail Club
status: candidate
platform: Squarespace
url: https://www.seattlecocktailclub.com/event
tags: [Nightlife, Community]
firstSeen: 2026-08-06
lastChecked: 2026-08-06
pr:
---

Monthly happy hours / mixers at rotating Seattle bars (Mini Bar, Majnoon,
Lady Jaye, Jude's, etc.) — not a fixed venue, so `geo: null`. No fixed
venue means this is a `venue`-role source in the sense that Seattle
Cocktail Club is the first-party organizer of its own event series
(same pattern as `sources/sync_seattle`), not an aggregator republishing
others' listings.

Note the URL: the site's nav points at `/events`, but that's a static
Summary-Block page. The actual Squarespace events collection lives at
the singular `/event` — confirmed `?format=json` on `/event` returns
`upcoming: [5]` items with future `startDate` epoch-ms values (Aug–Nov
2026): "The Floating Cocktail Club," "Happy Hour at Majnoon," "Swings &
Sips... Again!," "Happy Hour at Lady Jaye," "Happy Hour at Jude's."

🔥 High confidence — built-in `squarespace` ripper type, verified working
feed with future events.
