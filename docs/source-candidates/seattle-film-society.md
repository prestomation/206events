---
name: "Seattle Film Society"
status: added
platform: Squarespace
url: https://www.seattlefilmsociety.com/calendar
tags: [Movies, Arts]
firstSeen: 2026-05-20
lastChecked: 2026-05-20
pr: TBD
---
Filmmaker-run nonprofit organising local film screenings, festivals, and
filmmaker workshops in Seattle. Regular programs include Locals Only (monthly
short-film showcase), Open Screen, Truth to Fiction, and seasonal events like
Seattle is Burning and Bumbershoot collaborations.

Site is Squarespace with an events collection at `/calendar?format=json` that
returns 10 upcoming events (verified 2026-05-20). Events are held at rotating
venues including Northwest Film Forum, LANGSTON, Hidden Hall, Seattle Open Arts
Place (SOAP), and SIFF Film Center. Some events ("SFS Discussion") are Discord
online discussions with no physical address; those get location "SFS Discord".

Implemented as `sources/seattle_film_society/` with Squarespace ripper type,
`geo: null` (multi-venue), tags: Movies, Arts.
