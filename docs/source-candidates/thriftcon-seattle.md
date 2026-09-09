---
name: "ThriftCon Seattle"
status: candidate
platform: Custom (tickets.thriftcon.co — no known built-in ripper type)
url: https://tickets.thriftcon.co/landing/thriftcon-seattle
tags: [MakersMarket]
firstSeen: 2026-09-09
lastChecked: 2026-09-09
pr:
---

Annual thrift/vintage vendor convention, 2026 edition at Seattle
Convention Center — Summit Building, Saturday September 12, 2026,
100+ vendors.

Investigated 2026-09-09:
- `tickets.thriftcon.co` is a custom Cloudflare-fronted ticketing site,
  not Eventbrite/Squarespace/DICE/AXS/etc. — would need a custom
  HTML/JSON scraper
- Single dated event per year (one Seattle date/year), similar in shape
  to `cid-night-market` before it was implemented as a recurring YAML —
  would need 2-3 years of observed dates to establish a reliable pattern
  (currently only have the 2026 date)
- 🔴 Low confidence tier (custom scraper, single annual date) — lower
  priority than built-in-platform candidates

Keep as `candidate`. Worth a custom scraper or hand-maintained recurring
entry once a multi-year date pattern is confirmed (city venue conventions
often land in a fixed week, e.g. "second Saturday of September").
