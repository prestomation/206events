---
name: "Historic Seattle"
status: blocked
platform: WordPress (SiteGround)
url: https://historicseattle.org/events/
tags: [Community, Arts]
firstSeen: 2026-06-11
lastChecked: 2026-06-11
---
**Historic Seattle** — `https://historicseattle.org/events/` — Nonprofit preservation organization with property tours, lectures, advocacy events, and building history programs across Seattle.

Investigated 2026-06-11:
- SiteGround captcha (`sg-captcha: challenge` header) blocks automated access; returns HTTP 202 with `x-robots-tag: noindex`
- Cannot fetch event data without a browser proxy
- Would require `proxy: "browserbase"` to access
- No ICS feed visible from the public-facing pages

**Verdict**: Blocked — SiteGround captcha. Not worth implementing until browserbase proxy support is confirmed for this source. Re-evaluate if the captcha is removed.
