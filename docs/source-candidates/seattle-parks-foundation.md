---
name: "Seattle Parks Foundation"
status: added
platform: Tribe Events ICS (WordPress)
url: https://www.seattleparksfoundation.org/events/
tags: [Community, Parks, Volunteer]
firstSeen: 2026-06-10
lastChecked: 2026-06-11
---
**Seattle Parks Foundation** — `https://www.seattleparksfoundation.org/events/` — Nonprofit organization managing and activating Seattle's parks. Hosts volunteer restoration work parties, pop-up concerts, community events, and park programming.

Investigated 2026-06-10:
- WordPress site with Tribe Events plugin
- ICS feed at `https://www.seattleparksfoundation.org/events/list/?ical=1` — verified working, 30 upcoming events (June–July 2026)
- Event mix: ~22 volunteer park restoration work parties + 2 pop-up concerts + community events (VibeBingo, art events, walking tours, World Cup watch party)
- Concerts confirmed: "Pop-Up Concert in the Park: Lady A - The Real Lady A" (July 8) and "Pop-Up Concert in the Park: The New Triumph" (July 15)
- `geo: null` — events at many different Seattle parks (Golden Gardens, Volunteer Park, Green Lake, Westcrest, Kubota, Discovery Park, etc.)
- Tags: Community, Parks, Volunteer
- No proxy needed — accessible from sandbox

Considerations:
- Most events are volunteer restoration work parties (ivy removal, weeding, planting) — different character from entertainment events typically in 206.events
- Pop-up concerts and community events are valuable content
- Could be implemented with the ICS feed directly
- Similar to existing `volunteer_park_trust` source in scope

Source already implemented as `sources/external/seattle-parks-foundation.yaml` using the Tribe Events ICS feed at `https://www.seattleparksfoundation.org/?post_type=tribe_events&ical=1&eventDisplay=list`. Candidate doc created before the existing implementation was discovered.
