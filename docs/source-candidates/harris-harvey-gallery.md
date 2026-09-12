---
name: "Harris Harvey Gallery"
status: notviable
platform: Squarespace
url: https://www.harrisharveygallery.com/events
tags: [Art, Downtown]
firstSeen: 2026-09-12
lastChecked: 2026-09-12
---

Contemporary art gallery at 1915 1st Ave, downtown Seattle (First Thursday
art walk participant). Exhibitions are announced as individual static pages
(`/daphneminkoff-edgesofunmaking`, `/karen-kosoglad-finding-the-moment`,
etc.), not a dated calendar feed.

Investigated 2026-09-12:
- Confirmed Squarespace (`?format=json` resolves).
- The site does have a real Squarespace **events collection** at `/events`
  (sitemap lists it, `?format=json` returns the `upcoming`/`past`
  collection shape) — but it's effectively unused: `upcoming: []`,
  `past` has exactly 1 item (an "Artist Talk" from 2021, per the sitemap's
  `lastmod: 2021-09-17` on `/events/garyfaigin-artisttalk`). No events have
  been posted to this collection in 5 years.
- Exhibition receptions (e.g. the Sept 3, 2026 "Edges of Unmaking" opening)
  are announced only as prose on the static exhibition pages, with no
  structured date field to parse.
- Not viable with current ripper types — no dated, structured event feed to
  scrape. Re-check if the gallery ever starts using its `/events` collection
  again.
