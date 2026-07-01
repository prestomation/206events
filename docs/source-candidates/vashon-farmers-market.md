---
name: "Vashon Farmers Market"
status: added
platform: recurring YAML (fixed weekly schedule)
url: https://www.vigavashon.org/market
tags: [FarmersMarket, Vashon]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---
Weekly seasonal farmers market at the Village Green in the town of Vashon, run by the Vashon Island Growers Association (VIGA). Local produce, artisan goods, and live music.

Investigated 2026-07-01:
- Confirmed live via vigavashon.org: "Saturdays 10am-3pm: May 2-September 26" (2026 season)
- Not a duplicate — `sources/vashon_center_for_the_arts` covers a different organization (performing arts venue), not the farmers market
- Vashon is an already-established neighborhood in `city.config.ts` (see `sources/vashon_center_for_the_arts`), so this fits the existing scope

Implemented as recurring YAML (`sources/recurring/vashon-farmers-market.yaml`) — PR TBD.
