---
name: Zulus Games Calendar
status: added
platform: ICS (Google Calendar)
url: https://zulusgames.com/pages/calendar
tags: [Gaming, Bothell]
firstSeen: 2026-08-14
lastChecked: 2026-09-01
pr: 1334
---

Bothell board game store hosting Magic: The Gathering drafts/FNM/prereleases,
Flesh and Blood tournaments, Star Wars Unlimited events, and board game
nights at its "Event Center" / "Guildhall".

Real, live site, built on Shopify ("Integrated with BinderPOS", `/cdn/shop/
files/` asset URLs). Caveat: physical location is Bothell, not Seattle
proper — inside this project's geocoder bounding box (`city.config.ts`, up
to 47.8N) and there's precedent for similar-distance suburbs already carrying
their own neighborhood tag (Kenmore, Renton, Shoreline, Tukwila, Lake Forest
Park). Not already covered, not religious.

**Implemented 2026-09-01:** The `/pages/calendar` page itself has no
`?format=json`/product feed — it embeds a **public Google Calendar**
(`<iframe src="https://calendar.google.com/calendar/embed?...&src=<base64>">`).
Decoding the `src` param gives the calendar id
(`pnnfrgkbp668db7eqkcj256e2s@group.calendar.google.com`), which serves a
standard public ICS export at
`https://calendar.google.com/calendar/ical/pnnfrgkbp668db7eqkcj256e2s%40group.calendar.google.com/public/basic.ics`
— confirmed valid `VCALENDAR` with 2202 `VEVENT`s, 32 upcoming at time of
check. Added as `sources/external/zulus-games.yaml` (ICS, no custom ripper
code needed). Geo pinned to OSM node 2367594038 ("Zulu's Event Center", 10131b
Main St, Bothell, WA 98011; found via Nominatim structured search on the
street address). Registered `Bothell` as a new neighborhood tag in
`city.config.ts` (required for the venue's discovery-API neighborhood-tag
check). Some events use the location string "Zulu's Guildhall" (same venue,
different room nickname) — added a `KNOWN_VENUE_COORDS` entry in
`lib/geocoder.ts` so it resolves without a geocode error. `ONLY_SOURCE`
build: 0 config/parse/geocode errors, 2202 events in the raw feed, 32
upcoming.
