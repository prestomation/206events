---
name: "Olympic Rooftop Pavilion (Stoneburner)"
status: notviable
platform: Squarespace (blog, not an events collection)
url: https://www.stoneburnerseattle.com/the-olympic-rooftop-pavilion
tags: []
firstSeen: 2026-08-23
lastChecked: 2026-08-23
---

Rooftop bar/event space in Ballard (5214 Ballard Ave NW) operated by
restaurant Stoneburner, hosting occasional live music ("Concerts Under
the Stars") and workshops.

Investigated 2026-08-23:
- `olympicrooftoppavilion.com` does not resolve (DNS failure) — the venue
  is only reachable via `stoneburnerseattle.com`
- Confirmed Squarespace, but `/the-olympic-rooftop-pavilion?format=json`
  returns `typeName: "page"`, `itemCount: 0` — not a real Events
  collection, just a static info page
- Site's only dated/structured content is a `/blog` collection of wine
  and food posts (private-event announcements mixed with recipe content),
  not a scheduled public events calendar — would require unreliable prose
  scraping to extract actual dated public events, and most posts aren't
  events at all
- Not viable without a real events feed; re-check if Stoneburner adds a
  dedicated events collection
