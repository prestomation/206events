---
name: On the Hiyu
status: added
platform: ICS (Tribe Events)
url: https://onthehiyu.com/events/
tags: [Music, South Lake Union]
firstSeen: 2026-07-21
lastChecked: 2026-07-24
---

Refurbished ferry boat turned floating event venue at 860 Terry Ave N,
Seattle, WA 98109. Already added as external ICS source
(sources/external/on-the-hiyu.yaml).

## Proxy ladder history

- 2026-07-21: `proxy: false` → CI gets 0 events (likely WAF challenge). Escalated to `outofband`.
- 2026-07-24: `outofband` failing 3× consecutive (HTTP 403). Escalating to `browserbase`.