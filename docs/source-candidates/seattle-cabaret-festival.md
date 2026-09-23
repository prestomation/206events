---
name: "Seattle Cabaret Festival"
status: notviable
platform: GoDaddy Website Builder (JS-rendered)
url: https://seattlecabaretfestival.com/festival-calendar
tags: [Arts]
firstSeen: 2026-08-22
lastChecked: 2026-09-23
pr:
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

**Closed 2026-09-23:** The site now resets the connection from this environment. WebFetch returned only the GoDaddy page shell with no dates. From a web search, the festival is an annual May to June run (the 2026 edition opened May 8 at The Triple Door, with shows at Egan's Ballard Jam House). Both venues are already covered (`sources/triple_door/` and `sources/egans_ballard_jam_house/`), so the festival shows reach the calendar through them. The 2026 edition is over and no future dates are published.
