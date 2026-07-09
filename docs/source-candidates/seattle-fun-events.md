---
name: "Seattle Fun Events"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/seattle-fun-events-11424790611
tags: [Nightlife, "Pioneer Square"]
firstSeen: 2026-07-07
lastChecked: 2026-07-09
pr: 899
---
Seattle-based organizer producing themed costume bar crawls since 2012
(SantaCon, BunnyCon, LepreCon, HalloweenCon), consistently held at
Merchant's Cafe and Saloon in Pioneer Square — not a touring/national
production.

Investigated 2026-07-07:
- Eventbrite organizer `11424790611`
- 2 upcoming events confirmed at time of check: "Seattle HalloweenCon 2026"
  (Sat Oct 24 2026, Merchant's Cafe and Saloon), "Seattle SantaCon 2026"
  (Sat Dec 5 2026, Merchant's Cafe and Saloon)
- Seasonal recurring series (BunnyCon/LepreCon likely dormant until closer
  to spring) — not a one-off
- 🟡 Medium confidence: built-in `eventbrite` type, organizer ID untested
  against the live Eventbrite API (requires `EVENTBRITE_TOKEN`, not
  available in this environment)

Added 2026-07-09 (PR #899): CI confirmed 5 upcoming events via the live
Eventbrite API — "Seattle HalloweenCon 2026" (Oct 24 & 31, 2026) and
"Seattle SantaCon 2026" (Dec 5, 12 & 19, 2026), each a multi-Saturday
bar-crawl series rather than a single date. No parse errors.
