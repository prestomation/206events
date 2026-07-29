---
name: On the Hiyu
status: added
platform: ICS (Tribe Events)
url: https://onthehiyu.com/events/
tags: [Music, South Lake Union]
firstSeen: 2026-07-21
lastChecked: 2026-07-29
---

Refurbished ferry boat turned floating event venue at 860 Terry Ave N,
Seattle, WA 98109. Already added as external ICS source
(sources/external/on-the-hiyu.yaml) with `proxy: outofband`.
ICS feed works from residential IP but CI gets 0 events (likely WAF).
Shotgun.live venue page returns 429 Vercel Security Checkpoint.

2026-07-29: outofband rung failing (9 consecutive HTTP 403s). Escalating
to browserbase rung per proxy ladder. BROWSERBASE_API_KEY not set in
this environment so browserbase rung untested here — will be verified
on next run when key is available.