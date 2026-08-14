---
name: Meaningful Movies Seattle
status: investigating
platform: Unknown
url: https://meaningfulmovies.org/events
tags: [Film, Community]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Community documentary screening series with facilitated discussions at venues around Seattle.

**Findings (2026-08-14):** Blocked. Direct fetch (curl, browser UA) returns a bare HTML
shell with a meta-refresh to `/.well-known/sgcaptcha/?r=%2Fevents...` — a SiteGround
JS/CAPTCHA challenge page. WebFetch also came back empty for the same reason. Would need a
proxy/browser-executing fetch (e.g. Browserbase-style) to evaluate further.
