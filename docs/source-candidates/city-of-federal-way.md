---
name: City of Federal Way
status: investigating
platform: Drupal (Views calendar, no visible export)
url: https://www.federalwaywa.gov/calendar/event-list
tags: [Community, Federal Way]
firstSeen: 2026-09-24
lastChecked: 2026-09-24
pr:
---

City of Federal Way events calendar. Site is reachable (HTTP 200) and
runs on Drupal, but the calendar page (`/calendar/event-list`) has no
`ical`/`.ics`/RSS export link anywhere in the rendered HTML — likely a
plain Views listing with no feed display configured. Would need a
custom HTML scraper against the listing page rather than an ICS feed.
Left as `investigating`; revisit if the event volume looks worth a
custom ripper.
