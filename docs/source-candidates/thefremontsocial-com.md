---
name: National Whiskey Sour Day
status: notviable
platform: SpotHopper (restaurant/bar website builder)
url: https://thefremontsocial.com/events
tags: ["food", "nightlife"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: thefremontsocial.com.

Sample event: "National Whiskey Sour Day" (2026-08-25T18:00:00.000Z)
Description: It's National Whiskey Sour Day! Come down and let our awesome bartenders make you a great Whiskey Sour!

**2026-09-11:** Re-checked. Site returns 200 with a full page shell
(runs on the `spotapps.co`/SpotHopper platform — assets served from
`static.spotapps.co`), but a plain fetch of `/events` (with or without
`?ical=1`) contains no event markup at all in this environment —
title, description, dates for the sample event above don't appear
anywhere in the fetched HTML. Likely populated by a client-side widget
after page load (`wcpl_*` plugin scripts reference dynamic content).
No confirmed data endpoint found yet (no `/api/events`-shaped route in
the static markup). Left as `investigating` rather than `notviable` —
worth another look with a JS-rendering fetch or by finding SpotHopper's
underlying events API.

**2026-09-23:** Closed as notviable. The repo already has a built-in `spothopper` ripper, but it reads server-rendered `.event-calendar-card` markup on `/calendar`, and this site's `/calendar` is 404. `/events` renders only the placeholder "We are updating our events. Please stay tuned", and SpotHopper's API (`spothopperapp.com/api/spots/95822/events`) returns an empty `events` array. It's a bar with the odd "National X Day" promo and nothing currently listed. Reopen if the events page gets populated (use `type: spothopper` if it moves to `/calendar`).
