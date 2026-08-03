---
name: "Silent Dance Alki West Seattle"
status: notviable
platform: GoDaddy Website Builder
url: https://silentdance.org/
tags: [Music, "West Seattle"]
firstSeen: 2026-07-24
lastChecked: 2026-08-03
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

Re-checked 2026-08-03: plain-text extraction of the fetched HTML is
literally "Silent Dance Alki West Seattle Coming Soon Coming Soon Coming
Soon Coming Soon" — no schedule data, no dates, nothing to scrape.
Confirmed headless-browser rendering is not viable from this environment
either (Chromium via Playwright cannot reach any host through this
session's proxy — reproduced with a control fetch of `example.com`, so
it's an environment limitation, not specific to this site). Marking
`notviable`; revisit only if the organizer publishes a real calendar page
or ICS feed.
