---
name: "Seattle Aquarium"
status: added
platform: Eventbrite
url: https://www.seattleaquarium.org/events/
tags: [Museums, Downtown]
firstSeen: 2026-05-08
lastChecked: 2026-06-10
pr: 589
---

Seattle Aquarium events page uses the Speak/SiteWrench WordPress calendar plugin.
API config found in page HTML:
- `apiUrl`: `https://api.sitewrench.com`
- `apiToken`: `[REDACTED]`
- `siteId`: 2920, `pagePartId`: 427114

WP REST API confirms `swwpc_calendar` custom post type but returns 0 posts —
events are fetched client-side from SiteWrench API. The JS SDK uses `fetch('/api/')`
(relative URL). Need to identify the correct API endpoint path; `api.sitewrench.com`
returns 404 for all attempted paths. The SiteWrench API endpoint is not publicly
accessible. Not viable via SiteWrench.

**Update 2026-06-10:** Found the Seattle Aquarium also uses **Eventbrite** for their
public "After Hours" adult evening events — organizer ID `16503646468`.

- 5 upcoming events confirmed via Eventbrite web UI:
  - After Hours: Have a Ball — June 18, June 25, July 2 (Thu 5:30 PM, from $55)
  - After Hours Premier: Pride Celebration — July 17 (Fri 7:00 PM, from $61)
  - After Hours: Summer Vacation — August 13 (Thu 5:30 PM, from $55)
- Geo: lat 47.6076248, lng -122.3432202 (OSM relation 16051213)
- EVENTBRITE_TOKEN required in CI (same pattern as henry_art_gallery, etc.)
- Implemented as `sources/seattle_aquarium/ripper.yaml` using the built-in `eventbrite` type
- `defaultDurationHours: 3` — After Hours events are ~3h evening experiences
