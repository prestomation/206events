---
name: "WomenHack Seattle"
status: investigating
platform: Eventbrite
url: https://www.eventbrite.com/o/womenhack-46986659273
tags: [Tech]
firstSeen: 2026-08-31
lastChecked: 2026-08-31
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
