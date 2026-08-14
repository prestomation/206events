---
name: Dodgeball Seattle
status: investigating
platform: Unknown
url: https://www.dodgeballseattle.com
tags: [Playing-Sports, Dodgeball]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Adult recreational dodgeball league in Seattle.

Blocked: every direct fetch (WebFetch and curl, multiple attempts) returns
an sgcaptcha (SiteGround) bot-challenge redirect
(`/.well-known/sgcaptcha/?r=...`) instead of page content — no HTML ever
rendered. Can't assess event volume or platform until fetched via proxy.
Not yet checked against `sources/` for existing coverage.
