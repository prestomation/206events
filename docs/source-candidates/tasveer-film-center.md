---
name: Tasveer Film Center
status: candidate
platform: Custom HTML (Eventive ticketing)
url: https://filmcenter.tasveer.org/home
tags: [Film, Cultural]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Seattle South Asian film organization hosting screenings, festivals, and film events.

Confirmed live and real. Homepage lists ~24 films across "Now Playing"/"Coming
Soon" with checkout links to Eventive (external ticketing, e.g. "The Queen of
My Dreams"), and a link out to Eventive for the "21st Tasveer Film Festival
and Market 2026". No ICS/iCal feed found. Not a JSON API — some sub-routes
(e.g. `/whats-on`) render as a client-side "Loading..." shell that WebFetch
can't execute, so per-showtime dates live on individual film/checkout pages
rather than a single scrapable listing. Viable but would need HTML scraping
of the homepage film list plus Eventive checkout pages for showtimes, or an
Eventive-org-level integration if one exists. Not religious; Seattle-focused.
