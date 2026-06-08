---
name: "Seattle Christmas Market"
status: added
firstSeen: 2026-06-07
lastChecked: 2026-06-08
pr: claude/loving-hamilton-y9wljj
tags: [Community, QueenAnne, MakersMarket]
---
**Seattle Christmas Market** — `https://seattlechristmasmarket.com/` — Traditional European-style Christmas market at Seattle Center's Fisher Pavilion. Features German-inspired décor, Glühwein, local artisan vendors, live entertainment, and timed-entry ticketing. Runs ~35 days annually.

Investigated 2026-06-07:
- 2026 dates: **November 20 – December 24** (daily) at Seattle Center, Fisher Pavilion, 305 Harrison St
- Timed-entry tickets sold through the official website (no Eventbrite organizer found)
- No ICS feed; static event listing on seattlechristmasmarket.com
- Confirmed annual event (same Nov 20–Dec 24 range each year per `seattlecenter.com` listing)

Recurring YAML feasibility:
- Daily events from Nov 20 to Dec 24 would generate 35 events; the recurring YAML `every day` schedule with `months: [11, 12]` would over-generate (all of Nov and all of Dec rather than Nov 20–Dec 24 only)
- Could approximate with `months: [12]` only (misses the last 11 days of November) or accept some over-generation with `months: [11, 12]`
- Consider implementing as a single annual event or waiting for better date-range support in recurring YAML

From `ideas.md`: listed as "Daily, November 20 - December 24 (annual)"
