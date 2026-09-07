---
name: "WomenHack Seattle"
status: investigating
platform: Eventbrite
url: https://www.eventbrite.com/o/womenhack-46986659273
tags: [Tech]
firstSeen: 2026-08-31
lastChecked: 2026-09-03
---

Women/non-binary tech recruiting event series; multiple Eventbrite
organizer accounts exist for this multi-city brand
(`womenhack-46986659273`, `womenhack-26938147237`,
`womenhack-12632213821` all surfaced in search), with employer-ticket
listings referencing Seattle dates.

Investigated 2026-08-31: fetched the organizer page for the first org
ID found — no event data present in the static HTML (`@type` schema
only shows `ProfilePage`/`Organization`, no `Event` entries), likely
because Eventbrite organizer pages load events via a client-side API
call not present in the initial response. No `EVENTBRITE_TOKEN`
available in this environment to query the official API and confirm
event dates or, critically, which of the 3 org IDs is the Seattle-
specific one. Needs a follow-up with API access to identify the correct
organizerId and confirm live Seattle events before this can move to
`candidate`.

Re-checked 2026-09-03: the 3rd org ID from the original search,
`12632213821`, is the correct one — it's WomenHack's single global brand
account (86 live events across many cities worldwide, no per-city split).
Paging through it via the public unauthenticated mirror confirms **2 live
Seattle dates**: Oct 15, 2026 and Dec 3, 2026. With `expand=venue`, both
show `venue.address.city: "Seattle"` (lat/lng 47.609768/-122.322929 given,
but `address_1: "Job Fair"` — the real street address is withheld until
registration, a common recruiting-event pattern).

However, both listings are titled "WomenHack - Seattle - **Employer
Ticket**" — a WebFetch read of the event page describes it as primarily a
paid ticket for companies to attend as recruiters, not a general
job-seeker RSVP; no separate free/attendee-ticket listing was found under
this organizer for Seattle. This reads as a B2B recruiting product more
than a public community event. Also, since this is the brand's one global
organizer (not a Seattle-specific one), implementing via the built-in
`eventbrite` ripper type would pull in every city's events with no
location filter — would need a bespoke wrapper around
`EventbriteRipper.fetchAllEvents`/`parseEvents` (reusing those public
methods) with a client-side filter on `venue.address.city === "Seattle"`.
Given the B2B/employer-only framing, holding off on the custom-ripper
effort. Leaving as `investigating`; revisit if a general-admission
attendee ticket type for Seattle is ever found.
