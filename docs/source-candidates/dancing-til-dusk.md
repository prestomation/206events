---
name: "Dancing Til Dusk"
status: candidate
firstSeen: 2026-06-05
lastChecked: 2026-06-05
tags: [Dance, Music, Community]
---
Free outdoor summer dance series organized by Dance for Joy, with performances at various Seattle parks (Westlake Park, Freeway Park, Hing Hay Park, Ballard Commons, South Lake Union Park, Occidental Park, Lake City Mini Park, South Park Plaza, Golden Gardens, Volunteer Park). Different band/DJ each event covering swing, tango, salsa, West Coast swing, blues, Cajun/Zydeco, and hot club jazz.

**URL:** `https://danceforjoy.biz/dancingtildusk/`

**2026 Schedule:** 17 events, July 7 through August 30 (Tuesdays and Thursdays mostly, with one Sunday Aug 30). 6:00–9:00pm or 6:00–9:30pm.

**Platform:** Custom static HTML site — no ICS, RSS, or machine-readable feed. Schedule is an HTML table on the page.

**Implementation options:**
- Custom HTML scraper for `danceforjoy.biz/dancingtildusk/` — requires parsing the schedule table each year
- Not suited for recurring YAML (irregular Tue/Thu pattern with multiple park locations, not a simple weekly recurrence)
- Could also add individual events manually via event-uncertainty-cache if needed

**Notes:**
- Events are free, family-friendly
- Multiple locations (not a single venue) — `geo: null` or centroid of Seattle parks
- High community value but complex to implement reliably
