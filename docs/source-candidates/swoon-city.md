---
name: Swoon City
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/swoon-city-116050962771
tags: [Books, Creation, Ballard]
firstSeen: 2026-09-02
lastChecked: 2026-09-02
pr:
---

Romance bookstore and creative hub in Ballard (1716 NW Market St, Seattle,
WA 98107), opened 2025. Beyond selling romance books, it runs a dedicated
space for author book talks and a classroom space for art/craft classes
(embroidery, stained glass, visible mending), and features a rotating
artist during the Ballard Art Walk.

Investigated 2026-09-02 (found via web search for Seattle bookstore author
event calendars): confirmed Eventbrite organizer id `116050962771`
("swoon-city") via the event page's embedded JSON-LD/organizer data. Public
Eventbrite v3 API (`/api/v3/organizers/116050962771/events/?status=live`)
returned `object_count: 4` at time of check — Stained Glass Class, two
Embroidery Classes, and a Visible Mending class, all at the venue's own
address. Low but valid volume per the "Low-Volume Sources Are Valid"
directive. Not a religious org, not already covered under `sources/` or
`sources/external/`.

Implemented as the built-in `eventbrite` ripper type —
`sources/swoon_city/ripper.yaml`. Reuses the existing `EVENTBRITE_TOKEN`
repo secret already wired into CI for other Eventbrite sources; no new
secret needed. `geo` taken from the venue address's own Eventbrite-supplied
coordinates (47.6689014, -122.3796874).
