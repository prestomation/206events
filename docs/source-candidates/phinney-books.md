---
name: "Phinney Books"
status: candidate
platform: Squarespace
url: https://www.phinneybooks.com/upcoming-events/
tags: [Books, Greenwood]
firstSeen: 2026-07-04
lastChecked: 2026-07-04
pr:
---

Independent neighborhood bookstore at 7405 Greenwood Ave N, Seattle, WA
98103 (Phinney Ridge/Greenwood), opened by former Jeopardy! champion Tom
Nissley in 2014. Hosts author events and an in-house book club ("Ridge
Readers").

Investigated 2026-07-04:
- Confirmed Squarespace (`?format=json` on the events page returns a valid
  Squarespace site payload).
- `upcoming` array is currently **empty** (`0` events) — only 30 `past`
  events are populated, most recently a July 2025 author event. Per the
  "200 + 0 events" rule, do not implement yet; keep as `candidate` and
  re-check next cycle to see if new events get posted.
- Not currently covered elsewhere in `sources/` or `sources/external/`.
