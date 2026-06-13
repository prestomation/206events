---
name: "The Feast"
status: added
platform: OvationTix (AudienceView Professional)
url: https://the-feast.org
tags: [Theatre, Arts]
firstSeen: 2026-06-13
lastChecked: 2026-06-13
pr: pending
---

Discovered from r/SeattleEvents Reddit post promoting "The Wealth Walk 2026" (pay-what-you-choose).

Artist-driven ensemble theatre based in Seattle; pays actors living wages; tickets are sliding scale / pay-what-you-choose. Itinerant — performs at different venues per production (Mount Baker Park, Mount Baker Community Club, ACTUALIZE Artists In Residence, etc.).

**Ticketing:** OvationTix, client ID `35379`. Box office: https://ci.ovationtix.com/35379

**API:** `https://api.ovationtix.com/public/calendar/client(35379)` — public JSON, requires `clientId: 35379` and `Origin: https://the-feast.org` headers. Returns `performancesByDateDisplay` keyed by date.

**2026 season:**
- The Wealth Walk (outdoor): May 16 – June 7, Mount Baker Park (ended)
- The Wealth Walk (indoors): May 31 – June 7, Mount Baker Community Club (ended)
- Artists Doing: August 15, ACTUALIZE Artists In Residence, 112 Prefontaine Place S, Seattle

**Implementation:** `sources/the_feast/ripper.ts` — same OvationTix calendar API pattern as `taproot` and `spectrum_dance`. `geo: null` (itinerant). `expectEmpty: true` (dark between productions). Ticket URL is per-production: `https://ci.ovationtix.com/35379/production/{productionId}`.
