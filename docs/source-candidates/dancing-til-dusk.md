---
name: "Dancing Til Dusk"
status: added
firstSeen: 2026-06-05
lastChecked: 2026-06-06
pr: 508
tags: [Dance, Community]
---
Free outdoor summer dance series organized by Dance for Joy, with performances at various Seattle parks (Westlake Park, Freeway Park, Hing Hay Park, Ballard Commons, South Lake Union Park, Occidental Park, Lake City Mini Park, South Park Plaza, Golden Gardens, Volunteer Park). Different band/DJ each event covering swing, tango, salsa, West Coast swing, blues, Cajun/Zydeco, and hot club jazz.

**URL:** `https://danceforjoy.biz/dancingtildusk/`

**2026 Schedule:** 17 events, July 7 through August 30 (Tuesdays and Thursdays mostly, with one Sunday Aug 30). 6:00–9:00pm or 6:00–9:30pm.

**Platform:** Custom static HTML page (no ICS feed). Custom `IRipper` scraper in `sources/dancing_til_dusk/`.

**Implementation notes (2026-06-06):**
- Page uses h2 elements for location + time context, p elements for individual events
- Special `benefit_box` div for the August 30 Golden Gardens event (date in h2, not in p)
- All events confirmed in Seattle proper (10 different parks)
- All events are free public events
- 17 events confirmed via sample data
