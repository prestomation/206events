---
name: "SANCA (School of Acrobatics and New Circus Arts)"
status: added
platform: Eventbrite
url: https://sancaseattle.org/calendar/
tags: [Circus]
firstSeen: 2026-08-31
lastChecked: 2026-09-02
pr:
---

Georgetown circus school. `/calendar/` is a genuine Tribe Events
calendar with a working ICS export
(`https://sancaseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list`
— confirmed live, 6 VEVENTs with real future `DTSTART` dates).

Investigated 2026-08-31: the calendar content itself is **not
audience-facing events** — every entry is a school-administrative date
(facility closures, "No Classes // Georgetown Location - Turkey Camps",
"Fall 2 Enrollment", "Winter 1 Enrollment"). No performances, shows, or
recitals appear on this calendar. Checked the homepage for a dedicated
shows/performances page — only `/classes` and `/parties` nav links
exist, no public show listing. Not viable as a public events source:
the feed technically works but the content isn't the kind of thing
206.events publishes (not attendable public events).

**Re-investigated 2026-09-02 via a different channel — added.** While
chasing an Emerald City Trapeze lead (a Halloween show, "Carnevolar XIV:
Ascension"), found its Eventbrite ticket link resolves to organizer
`44465040643`, whose account name is **SANCA**, not Emerald City
Trapeze. SANCA has operated Emerald City Trapeze Arts (2702 6th Ave S,
SoDo) as a second location since 2023, alongside its own Georgetown
studio (674 S Orcas St) — so this organizer is SANCA's own
audience-facing show ticketing (distinct from the admin-only Tribe
calendar on their own site investigated above). Public Eventbrite API
(`/organizers/44465040643/events/?status=live`) confirms 3 live events
at time of check — the three Carnevolar XIV nightly occurrences
(Oct 29-31, 2026), each with a real per-event venue (`Emerald City
Trapeze Arts`, exact address + lat/lng) via `expand=venue`. Implemented
as the built-in `eventbrite` ripper type — `sources/sanca/ripper.yaml`
(`sourceRole: venue`, `geo: null` since the org spans two physical
locations, mirroring the existing multi-branch `third_place_books`
pattern) — no new secret needed, reuses `EVENTBRITE_TOKEN`.
