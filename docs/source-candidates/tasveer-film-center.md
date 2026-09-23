---
name: Tasveer Film Center
status: added
platform: Indy Systems (GraphQL)
url: https://filmcenter.tasveer.org/home
tags: [Film, Cultural]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr: 1570
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

2026-09-23: Added as custom ripper `sources/tasveer_film_center/` (source name `tasveer-film-center`). The site runs on the Indy Systems cinema platform; its same-origin GraphQL endpoint (`https://filmcenter.tasveer.org/graphql`, scoped by public `site-id: 262` / `circuit-id: 138` headers from the site bundle) returns every upcoming public showing via `showingsForDate` with no date argument. One POST per build. ONLY_SOURCE build: **113 events**, 0 errors. Film-festival passes on Eventive (tffm-2026.eventive.org) are not included.
