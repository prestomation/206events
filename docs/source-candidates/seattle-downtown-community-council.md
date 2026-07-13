---
name: "Seattle Downtown Community Council (DCC)"
status: candidate
platform: Eventbrite
url: https://www.eventbrite.com/o/seattle-downtown-community-council-dcc-102942974681
tags: [Community, Downtown]
firstSeen: 2026-07-11
lastChecked: 2026-07-13
pr:
---

Volunteer-powered residents coalition working on downtown Seattle
livability.

Investigated 2026-07-11:
- Confirmed Eventbrite organizer (id `102942974681`).
- Only 1 upcoming event at time of check: "Hike The Hood with the We
  Deliver Care Safety Team".
- Below the "a few events, not a one-off" bar for now — re-check in a
  future cycle to see if event volume grows before implementing.

Re-checked 2026-07-13: still 1 confirmed upcoming event via the public
Eventbrite organizer API (`upcomingEventsTotal: 1`, same "Hike The Hood"
event). Per the source-discovery skill's "Directive: Low-Volume Sources
Are Valid" (event count is not a rejection criterion — any working source
is better than no source), implemented via the built-in `eventbrite`
ripper type: `sources/seattle_downtown_community_council/ripper.yaml`,
`organizerId: 102942974681`. Events are itinerant (walking tours/meetings
at rotating downtown locations, no fixed venue), so `geo: null` at the
ripper level with `sourceRole: venue` (first-party organizer), matching
the freeze-tag-events/mixmix-socials pattern. Tags: `Community`,
`Downtown` (existing registered neighborhood tag). Local
`ONLY_SOURCE=seattle-downtown-community-council` build validates the
config schema (0 events locally, expected — `EVENTBRITE_TOKEN` isn't
available in this environment); events to be confirmed via CI, which has
the token provisioned for other Eventbrite sources.
