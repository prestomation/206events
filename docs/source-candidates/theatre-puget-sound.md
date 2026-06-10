---
name: "Theatre Puget Sound"
status: blocked
platform: SiteGround (unknown calendar system)
url: https://theatrepugetsound.org/
tags: [Theatre, Arts]
firstSeen: 2026-06-10
lastChecked: 2026-06-10
---
**Theatre Puget Sound** — `https://theatrepugetsound.org/` — Regional theater service organization offering calendar subscriptions (Google, iCalendar, Outlook, .ics export) for Pacific Northwest theater productions.

Investigated 2026-06-10:
- HTTP response: `202` with `sg-captcha: challenge` header — SiteGround bot challenge
- All fetch paths blocked; HTML returns 169-byte challenge page only
- Cannot determine data format or ICS feed URL without bypassing bot protection
- Same SiteGround captcha pattern as earshot-jazz (now on `proxy: "browserbase"`)
- Tags: Theatre, Arts (primarily serves PNW theater, not strictly Seattle)

Block status: Would need `proxy: "browserbase"` rung to bypass SiteGround captcha. Defer unless prioritized.
