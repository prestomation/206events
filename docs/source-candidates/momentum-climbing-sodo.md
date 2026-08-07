---
name: "Momentum Indoor Climbing - SODO"
status: notviable
platform: WordPress (JS-rendered events widget)
url: https://momentumclimbing.com/sodoevents/
tags: [Sports, SoDo]
firstSeen: 2026-08-07
lastChecked: 2026-08-07
---

Climbing gym chain's Seattle location at 2759 1st Ave S, SODO. Hosts monthly
themed community nights (Board Games/Boulders & Brews, BIPOC Night, Cosmic
Night, Breakfast Club, LGBTQ+ Night, Bends and Brews).

Investigated 2026-08-07:
- `/sodoevents/` page's "UPCOMING EVENTS" section renders as static
  `EVENT NAME` / `SIGN UP` placeholders in the raw HTML — the actual event
  list is populated client-side by JS after load, not present in the fetched
  markup.
- `wp-json/` namespace listing shows no Tribe Events (or other calendar
  plugin) REST route — no structured events endpoint to hit directly either.

**Verdict**: Not viable without a headless browser — no static HTML or JSON
feed exposes dated events. Re-check if the site adds a Tribe Events plugin or
a JSON events endpoint.
