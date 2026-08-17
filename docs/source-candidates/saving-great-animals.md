---
name: Saving Great Animals Events
status: added
platform: ICS (Tribe Events)
url: https://savinggreatanimals.org/events/
tags: [Community, Volunteer]
firstSeen: 2026-08-14
lastChecked: 2026-08-17
pr:
---

Seattle-area animal rescue hosting adoption events and volunteer opportunities.

**Vetting notes (2026-08-14):** Strong find. Real, live WordPress site running
The Events Calendar (Tribe Events) plugin — confirmed by `tribe_events` in the
calendar feed URLs. At least 3 upcoming events confirmed at check time (Flying
Bike Brewery trivia night, Dog Yard Bar adoption event, "The Bark Benefit 2026"
at Meydenbauer Center). The page exposes Google Calendar, iCalendar (webcal),
and Outlook export links — standard Tribe Events `?ical=1` style feed should
work directly as an `sources/external/*.yaml` ICS entry. No custom ripper
needed. Not yet covered by any existing source.

Implemented 2026-08-17: `sources/external/saving-great-animals.yaml`,
`icsUrl: https://savinggreatanimals.org/events/?ical=1`, `geo: null`,
`sourceRole: venue` (first-party feed for one org's own event series,
even though events happen at rotating partner venues — same pattern as
`sources/seattle_social_club`), tags `[Community, Volunteer]` (no
existing `Pets`/`Animals` tag registered elsewhere, so reused existing
tags that fit the adoption/volunteer nature of the events rather than
introduce a new one-off tag). `ONLY_SOURCE=saving-great-animals npm run
generate-calendars` confirmed 3 upcoming events, 0 parse errors, 0
external calendar failures.
