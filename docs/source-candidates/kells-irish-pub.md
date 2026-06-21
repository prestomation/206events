---
name: "Kells Irish Pub"
status: blocked
platform: WordPress (SiteGround CAPTCHA)
url: https://kellsirish.com/seattle/events/
tags: [Music, Nightlife, "Pike Place Market"]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Kells Irish Restaurant & Pub at 1916 Post Alley (Pike Place Market). Live Irish traditional music, Celtic nights, pub trivia, and cultural events. Historically one of Seattle's premier Irish pubs.

Investigated 2026-06-21:
- WordPress site but SiteGround sgcaptcha blocks automated access
- HTTP 202 response with `sg-captcha: challenge` header and `x-robots-tag: noindex`
- JavaScript captcha redirect: `window.location.replace()` to sgcaptcha challenge URL
- Would require `proxy: "browserbase"` to bypass

**Verdict**: Blocked — SiteGround sgcaptcha prevents automated fetching. Would require `proxy: "browserbase"` escalation. Re-evaluate if the captcha is removed or if out-of-band proxy successfully retrieves data.
