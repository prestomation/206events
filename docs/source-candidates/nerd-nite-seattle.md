---
name: "Nerd Nite Seattle"
status: added
platform: unknown (WordPress network, WP Engine)
url: https://nerdnite.com/
tags: []
firstSeen: 2026-09-21
lastChecked: 2026-09-23
---

Monthly science/nerd-culture lecture night, next confirmed via search at
Old Stove Brewing (Ship Canal) on Oct 2, 2026. The global `nerdnite.com`
site is a WP Engine-hosted WordPress network with per-city chapters, but
neither `/seattle/` nor `/city/seattle` resolved (both 404) from this
environment — the correct chapter URL slug wasn't found this cycle.
Re-investigate with a fresh search for the exact Seattle chapter path (or
check if the chapter has moved off the network entirely, e.g. to its own
Meetup/Eventbrite page) before implementing.

**2026-09-23:** Found the chapter: `https://seattle.nerdnite.com/`, which links to the Eventbrite organizer `nerd-nite-seattle-120853014468`. Added as `sources/nerd_nite_seattle/ripper.yaml` (`type: eventbrite`, organizerId `120853014468`, `geo: null` since the venue can change, tag Education). The organizer page lists a live upcoming show, **Oct 2, 2026, 7pm at Old Stove Brewing Ship Canal** (600 W Nickerson St), confirmed via that event page's JSON-LD. Earlier 2026 editions were Mar 27 and Jun 26. Couldn't verify via a local ONLY_SOURCE build because `EVENTBRITE_TOKEN` isn't set in this environment (the config loads fine and the only error is the missing token). CI has the token.
