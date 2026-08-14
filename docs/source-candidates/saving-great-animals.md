---
name: Saving Great Animals Events
status: candidate
platform: ICS (Tribe Events)
url: https://savinggreatanimals.org/events/
tags: [Pets]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
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
