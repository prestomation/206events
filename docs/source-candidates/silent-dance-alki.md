---
name: "Silent Dance Alki West Seattle"
status: investigating
platform: GoDaddy Website Builder
url: https://silentdance.org/
tags: [Music, "West Seattle"]
firstSeen: 2026-07-24
lastChecked: 2026-07-24
---
Community silent-disco/dance gathering held at least once a month at
Alki Beach, West Seattle. Distinct from the "Silent Disco NW / Secret
Sunset Seattle" Eventbrite organizers already tracked in
`docs/source-candidates/silent-disco-nw.md` (both currently 0 upcoming
events) — this is a separate, GoDaddy-hosted organizer.

Investigated 2026-07-24:
- Site is built on GoDaddy's Website Builder ("Websites + Marketing")
  platform; the fetched HTML is almost entirely inlined CSS with no
  visible event dates or schedule data in the static response — content
  appears to be client-rendered
- No obvious public JSON/API endpoint found in a quick pass
- Cadence described as "at least once per month" with no fixed
  day-of-week/time pattern found yet, which would make a
  `sources/recurring/` entry a poor fit even if dates were confirmed

**Next step**: needs a browser-rendered look at the page (or a direct
message to the organizer) to find real dates before this can move past
`investigating`. Low confidence given the platform and irregular
cadence.
