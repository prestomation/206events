---
name: CCS Seattle
status: added
platform: Wix
url: https://www.ccsseattle.com/events
tags: [Nightlife, "Capitol Hill"]
firstSeen: 2026-08-14
lastChecked: 2026-09-02
pr: 1353
---

Seattle nightlife venue hosting live music and events. Calendar available on their website.

**Checked 2026-08-14:** Confirmed live — CC's Seattle, a longtime gay
bar on Capitol Hill. Wix-hosted (`static.wixstatic.com` image URLs).
Programming is recurring weekly/monthly rather than one-off dated
events: Music Bingo (Tue), Seattle Gaymers (Wed), plus monthly themed
nights (The Gathering Happy Hour + ONYX Northwest 1st Fri, Fetish Night
1st Sat, Naked Monday Meetup 2nd Mon, Funderwear 3rd Sat, Furry Friday
4th Fri, WSLO Community Social 4th Sat). Would suit a
`sources/recurring/<name>.yaml` entry with multiple `schedules:` entries
rather than a scraped ripper.

**Implemented 2026-09-02:** Address confirmed via the site's homepage
(1701 East Olive Way, Seattle, WA 98102) and geocoded to OSM node
2158768715 (47.6197166, -122.3233324). Each named recurring night is a
distinct event (not one event on several schedules), so this landed as
nine separate `sources/recurring/ccs-seattle-*.yaml` files, one per
night: `tunesday-bingo` (every Tue), `gaymers` (every Wed),
`gathering-happy-hour` (1st Fri), `leather-social` (1st Fri),
`fetish-night` (1st Sat, $5), `naked-monday` (2nd Mon), `funderwear`
(3rd Sat, $5), `furry-friday` (4th Fri), `wslo-social` (4th Sat).
ASL classes (Thursdays) were confirmed on-page as "currently on summer
break" at time of check, so left out of this pass — worth adding once
they resume. All 9 verified locally via
`ONLY_SOURCE=ccs-seattle-tunesday-bingo,ccs-seattle-gaymers,ccs-seattle-gathering-happy-hour,ccs-seattle-leather-social,ccs-seattle-fetish-night,ccs-seattle-naked-monday,ccs-seattle-funderwear,ccs-seattle-furry-friday,ccs-seattle-wslo-social npm run generate-calendars`
(1 event each, 0 errors) and `npm run check-discovery-api`.
