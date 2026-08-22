---
name: "Seattle Cabaret Festival"
status: investigating
platform: GoDaddy Website Builder (JS-rendered)
url: https://seattlecabaretfestival.com/festival-calendar
tags: [Arts]
firstSeen: 2026-08-22
lastChecked: 2026-08-22
---

Annual cabaret/burlesque festival, surfaced in a "Seattle burlesque cabaret
show calendar" search alongside Unicorn (already covered via
`sources/recurring/unicorn-seattle-*.yaml`) and The Triple Door (already
covered — see `sources/triple_door/`).

Investigated 2026-08-22: `/festival-calendar` returns 200, but the body is a
GoDaddy Website Builder (Starfield Technologies) bundle — no server-rendered
event markup, only the app shell CSS/JS. Would need a headless
browser/proxy to read the actual calendar content. Likely a single annual
festival (low event volume even if scrapable) rather than an ongoing venue
calendar.

Left as `investigating` — worth a follow-up with a JS-rendering check
(browserbase) if this becomes a priority, but low volume makes it a low
priority relative to other candidates.
