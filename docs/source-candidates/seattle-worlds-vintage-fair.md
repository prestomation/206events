---
name: "Seattle World's Vintage Fair"
status: candidate
firstSeen: 2026-06-07
lastChecked: 2026-06-07
tags: [Community, QueenAnne]
---
**Seattle World's Vintage Fair** — `https://www.seattleworldsvintagefair.com/` — Annual one-day vintage fair at Seattle Center Exhibition Hall, organized by Throwbacks NW & Por Vida NW (the team behind Tacoma Sunday Market). Features vintage clothing, antiques, collectibles, textiles, accessories, records, sneakers, and more.

Investigated 2026-06-07:
- 2025 date: May 10, 2025 (Saturday); 2026 date: May 9, 2026 (Saturday) — consistently 2nd Saturday of May
- Eventbrite event listing: `https://www.eventbrite.com/e/seattle-worlds-vintage-fair-tickets-1981550376518` (2026, already passed)
- No standing Eventbrite organizer account for the fair (organized under "Throwbacks NW" or "Por Vida NW")
- 2026 event has already passed; next event expected May 2027

Recurring YAML feasibility: "2nd Saturday of May" is a clean pattern — `schedule: "2nd Saturday"`, `months: [5]`. But the event is only one day per year and the next occurrence isn't until May 2027, so event generation would produce nothing for the remainder of 2026.

Consider implementing as recurring YAML once verified the "2nd Saturday of May" pattern holds across 3+ years.
