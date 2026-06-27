---
name: "Barnes & Noble Northgate"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/barnes-noble-northgate-seattle-wa-81544301213
tags: [Books]
firstSeen: 2026-06-27
lastChecked: 2026-06-27
---

Barnes & Noble bookstore at Northgate Station (401 NE Northgate Way, Suite 1100, Seattle, WA 98125). Hosts author readings, book signing events, and literary celebrations.

Investigated 2026-06-27:
- Eventbrite organizer confirmed: `81544301213` ("Barnes & Noble - Northgate (Seattle, WA)")
- 6 upcoming events confirmed in July–August 2026 (author readings: Emily Varga, Victoria Carbol, Lexi LaFleur Brown, Taylor J. LaRue, Emily Rath, M. K. Lobb)
- Implemented as `sources/barnes_noble_northgate/` with built-in `type: eventbrite`
- geo: 47.706267, -122.325811 (401 NE Northgate Way, confirmed via web search)
- `EVENTBRITE_TOKEN` already wired in CI; no new secret needed
- sourceRole: venue (brick-and-mortar bookstore, not an aggregator)
