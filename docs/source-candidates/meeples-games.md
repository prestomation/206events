---
name: Meeples Games Events
status: investigating
platform: Unknown
url: https://meeplesgames.com/events
tags: [Board-Games, West Seattle]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

West Seattle board game cafe hosting game nights, tournaments, and tabletop events.

**Findings (2026-08-14):** Blocked. Direct fetch (curl, browser UA) returns a bare HTML
shell with a meta-refresh to `/.well-known/sgcaptcha/?r=%2Fevents%2F...` — a SiteGround
JS/CAPTCHA challenge, same pattern as meaningful-movies.org and newseattlewaterfront.org.
Would need a proxy/browser-executing fetch to evaluate further. No prior "meeples" ripper
found in `sources/`.

**2026-08-25 (aggregator gap analysis, merged in from a duplicate
`meeplesgames-com.md` file mistakenly titled "Star Wars X-Wing" — same
domain/URL, consolidated here):** 10 events found in a Seattle metro
sample. Sample event: "Star Wars X-Wing" (2026-08-25T02:00:00.000Z) —
"Free Star Wars X-Wing night every Tuesday at 6:30 PM. Bring your
squadron for epic space battles. All skill levels welcome." Consistent
with the sgcaptcha finding above: events exist behind the JS challenge.
