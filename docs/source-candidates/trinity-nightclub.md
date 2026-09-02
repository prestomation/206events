---
name: Trinity Nightclub
status: added
platform: Eventbrite
url: https://www.trinitynightclub.com
tags: [Nightlife, Music, "Pioneer Square"]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
pr:
---

Downtown Seattle nightclub featuring EDM, house, and dance music events.

Real, live site (107 Occidental Ave S, Pioneer Square), built on Squarespace
(squarespace-cdn.com asset URLs). Homepage "UPCOMING EVENTS" section shows
~6 events across three recurring series (Y2K Thursdays, Trinity Fridays,
Reload Saturdays), plus a link out to Eventbrite for "MORE MASSIVE FRIDAYS &
RELOAD SATURDAYS DATES" — the Eventbrite organizer ID/name wasn't confirmed
(guessed `/events` sub-path 404'd), so a follow-up pass should locate the
actual Eventbrite organizer link before implementing (built-in `eventbrite`
ripper type would apply if found). Not already covered, not religious.

**Implemented 2026-09-02:** Found the Eventbrite organizer link
(`eventbrite.com/o/trinity-nightclub-33445751813`, organizer id
`33445751813`) directly on the venue's homepage. Confirmed via the public
Eventbrite v3 API (`/api/v3/organizers/33445751813/events/?status=live`,
no auth needed for this read): 38 live events (weekly Y2K Thursdays,
Fridays at Trinity, and Reload Saturdays series, plus a Labor Sunday
special). Implemented as the built-in `eventbrite` ripper type —
`sources/trinity_nightclub/ripper.yaml` — reusing the existing
`EVENTBRITE_TOKEN` repo secret already wired into CI for other Eventbrite
sources (fog-room, club-sur, space-city); no new secret needed. Venue
address (107 Occidental Ave S, Seattle, WA 98104) geocoded to OSM way
140631769 ("Grand Central" building, Pioneer Square).
