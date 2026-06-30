---
name: "Queer Social Club Seattle"
status: added
platform: Squarespace (events-stacked collection, ?format=json)
url: https://queersocialclub.com/events-seattle
tags: [LGBTQ, Community]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
---

Seattle-based LGBTQ+ community events aggregator curating social events across multiple venues. Squarespace `events-stacked` collection exposing a `?format=json` endpoint.

Verified 2026-06-30: 73 upcoming events returned by `https://queersocialclub.com/events-seattle?format=json` (all `startDate` in the future). Majority Seattle events; a handful in Tacoma and Woodinville. Full location data present (`addressTitle`, `addressLine1`, `addressLine2`).

Sample events: Trivia Tuesday Ballard, Drag Queen Bingo, Lesbian/Queer Pickup Soccer, RuPaul's Drag Race viewing party, Board Gayme Night at Stoup Brewing.

Implemented as `sources/queer_social_club` with `type: squarespace`, `sourceRole: aggregator`, `geo: null`.
