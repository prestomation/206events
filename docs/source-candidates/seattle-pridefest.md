---
name: "Seattle PrideFest"
status: added
platform: Squarespace
url: https://www.seattlepridefest.org/schedule
tags: [Community, Arts]
firstSeen: 2026-06-10
lastChecked: 2026-06-10
pr: 598
---
**Seattle PrideFest** — `https://www.seattlepridefest.org/schedule` — Seattle's annual LGBTQ+ Pride festival organization, producing PrideFest Capitol Hill (June 27) and PrideFest Seattle Center (June 28), plus "Taking Pride in Capitol Hill" community cleanup (June 6).

Investigated 2026-06-10:
- Squarespace confirmed (squarespace-cdn.com image URLs)
- `?format=json` returns 2 upcoming events: PrideFest Capitol Hill (June 27) and PrideFest Seattle Center (June 28)
- Individual event pages offer ICS download links (per-event only, not a feed)
- Very low volume — only 2 annual flagship events in the upcoming array
- `geo: null` — events at Capitol Hill street closures and Seattle Center

Next steps: Re-check after June 2026 Pride events to see if fall/winter programming is added. If consistently only 2 annual events, consider as recurring YAML instead.
