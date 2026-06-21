---
name: "Seattle Youth Symphony Orchestras (SYSO)"
status: blocked
platform: WordPress / Tribe Events (SiteGround CAPTCHA)
url: https://www.syso.org/events/
tags: [Music, Arts, Education]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Seattle Youth Symphony Orchestras (SYSO) — classical music education organization running multiple youth orchestras, string ensembles, and the Seattle Preps program. Concerts and performances at Benaroya Hall and other Seattle venues.

Investigated 2026-06-21:
- WordPress site with The Events Calendar (Tribe Events) plugin confirmed — events page shows ICS export button
- ICS feed URL: `https://www.syso.org/?post_type=tribe_events&ical=1`
- **SiteGround CAPTCHA blocks fetch**: `x-redirect-by: sgcaptcha` in response — HTTP response returns a JavaScript captcha challenge, not ICS data
- Events page shows "There are no upcoming events" currently (summer academic lull)
- Would need `proxy: "browserbase"` to bypass captcha AND there are currently 0 events

**Verdict**: Blocked — SiteGround sgcaptcha. Re-evaluate when the 2026-2027 concert season is announced (typically September) — if events appear, escalate to browserbase proxy. Expected events: 4–8 concerts per year at Benaroya Hall.
