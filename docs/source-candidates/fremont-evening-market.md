---
name: "Fremont Evening Market"
status: added
platform: recurring YAML
url: https://www.seattlelocalmarkets.com/
tags: [MakersMarket, Fremont, Community]
firstSeen: 2026-06-10
lastChecked: 2026-06-10
pr: 588
---
Monthly evening market in Fremont (N 35th St between El Camino & Triangle Spirits). Runs on the last Thursday of each month, February–November. Hours: 4–8pm in Feb/Mar/Nov, 5–9pm April–October. Curated vintage, handmade, and local vendors. Organized by Seattle Local Markets.

Confirmed 2026 dates: April 30, May 28, June 25, July 30, August 27, September 24, October 29.

Implemented 2026-06-10 as `sources/recurring/fremont-evening-market.yaml` with two schedule entries (winter vs spring/summer/fall hours). RRULEs:
- `FREQ=MONTHLY;BYDAY=-1TH;BYMONTH=2,3,11` (4–8pm)
- `FREQ=MONTHLY;BYDAY=-1TH;BYMONTH=4,5,6,7,8,9,10` (5–9pm)
