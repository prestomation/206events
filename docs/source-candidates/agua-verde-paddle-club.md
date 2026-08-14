---
name: Agua Verde Paddle Club
status: investigating
platform: Unknown
url: https://aguaverdepaddleclub.com
tags: [Outdoors]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Seattle paddle board and kayak rental club offering paddling events and water activities on Lake Union.

**Checked 2026-08-14:** Blocked. Both WebFetch and a direct curl return a
SiteGround `sgcaptcha` JS bot-challenge redirect
(`/.well-known/sgcaptcha/?r=...`) instead of page content — the same
JS-challenge pattern noted in the proxy-escalation docs (skip straight
to the `browserbase` rung; a plain residential fetch gets the same
challenge). Can't evaluate events/platform without a browser-executing
fetch. Left as `investigating`; revisit with Browserbase Fetch API if
this becomes a real candidate.
