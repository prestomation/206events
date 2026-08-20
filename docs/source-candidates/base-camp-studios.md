---
name: Base Camp Studios
status: added
platform: Instagram
url: https://www.basecamp206.com/
tags: [Arts, Belltown]
firstSeen: 2026-08-20
lastChecked: 2026-08-20
pr:
---

Artist studio, gallery, and community space in Belltown — two galleries
(BCS at 2407 1st Ave, BCS2 at 1901 3rd Ave) plus off-site programming in
Portal Park (1st Ave & Battery St). Programs its own exhibitions, artist
talks, markets, immersive performance runs, and the annual Summer Outdoor
Movie Series.

Added as `sources/base-camp-studios/` with `type: instagram`
(`username: base.camp.studios`), per `skills/instagram-source/SKILL.md`.

## Why Instagram and not the website

`basecamp206.com` is Squarespace and **does** have an events collection at
`/events?format=json` (`typeName: events-stacked`, 262 items) — but it is
abandoned: `upcoming` is empty and the newest `past` item is 2025-04-24.
All current programming is announced on Instagram, with dates and times
baked into the flyer images rather than the captions. If the Squarespace
collection is ever revived it would be the better source (a `squarespace`
ripper, no vision step) — worth re-checking periodically.

`geo: null` at the ripper level: the account covers two buildings plus the
park, so per-event addresses come from the cache.

## Coverage note

The Curious Levity **ALL IN** run at Base Camp Studios 2 is already
published from the `events12` source (its Eventbrite listing, nightly 8pm
through 2026-09-05), so those posts are recorded as non-events in
`instagram-cache.json` rather than duplicated. Only the 8/21 performance is
missing from that upstream listing.

Portal Park needed a `KNOWN_VENUE_COORDS` entry in `lib/geocoder.ts` —
it isn't indexed in OSM under that name and Nominatim can't parse the bare
"1st Ave & Battery St" intersection.
