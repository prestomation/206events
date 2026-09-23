---
name: "Startup Grind Seattle"
status: notviable
platform: Eventbrite
url: https://www.eventbrite.com/o/startup-grind-6691755673
tags: [Tech]
firstSeen: 2026-08-31
lastChecked: 2026-09-23
---

Global entrepreneur-community brand with a Seattle chapter
(`meetup.com/startup-grind-seattle` also exists). The Eventbrite
organizer ID found (`6691755673`) appears to be the global/parent
account rather than Seattle-specific.

Investigated 2026-08-31: fetched the organizer page — no event data in
the static HTML (same client-side-loaded limitation as WomenHack
above), and no confirmation this org ID is scoped to Seattle events
specifically rather than the brand's global calendar. No
`EVENTBRITE_TOKEN` available in this environment to query the API.
Needs a follow-up with API access to find the Seattle-chapter-specific
organizer ID (if one exists separate from the global account) before
this can move to `candidate`.

2026-09-23: The Seattle chapter's Meetup ICS (meetup.com/startup-grind-seattle/events/ical/) is empty, and the Bevy chapter page (startupgrind.com/seattle/) shows no upcoming events — only past, mostly virtual events cohosted from other chapters. Chapter appears inactive locally; closing.
