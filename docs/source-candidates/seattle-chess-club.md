---
name: "The Seattle Chess Club"
status: added
pr: 797
platform: recurring YAML (WordPress + Modern Events Calendar, verified via per-event pages)
url: https://seattlechess.club/events/
tags: [Gaming, "Green Lake"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

**The Seattle Chess Club** — `https://seattlechess.club/events/` — founded 1879, hosted at Orlov Chess Academy, 7212 Woodlawn Ave NE, Seattle (Green Lake neighborhood).

Investigated 2026-07-01:
- WordPress site running Modern Events Calendar (MEC); `/events/` renders as a full-calendar skin (month grid + JS-driven "load more"), not a plain scrapable list — the `wp-json/mec/v1/events` REST route returns `[]` without params, and the free MEC plugin's public Event API needs a key. Not viable as a live-fetched ripper.
- However, the two weekly club nights are confirmed via their individual per-event pages as stable, fixed-schedule recurring events:
  - **Wednesday Casual Chess** — free, drop-in, 7:00pm–11:00pm every Wednesday (confirmed instance: Jul 01 2026)
  - **Friday Night Rated Chess** — USCF-rated tournament, $5 general / free for paid members, 7:15pm–11:45pm every Friday (confirmed instance: Jul 03 2026)
- A third pattern ("Fifth Friday G15 Quick Rated Chess") occurs only on months with a 5th Friday — low frequency (a few times/year), skipped for this pass to keep scope tight.
- Implemented as two `sources/recurring/` YAML entries (one file per named event, matching the Little Red Hen pattern) rather than a live ripper, since the underlying site isn't fetchable as a stable feed but the schedule itself is fixed and long-published (club founded 1879, weekly cadence unchanged).

Re-evaluate if MEC's REST API becomes accessible without a key, or if a 5th-Friday variant is worth adding later.
