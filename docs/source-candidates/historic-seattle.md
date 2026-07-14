---
name: "Historic Seattle"
status: added
platform: WordPress (Tribe Events)
url: https://historicseattle.org/events/
icsUrl: https://historicseattle.org/events/?ical=1
tags: [Arts, Education, "First Hill"]
firstSeen: 2026-06-11
lastChecked: 2026-07-14
pr: 758
---
**Historic Seattle** — `https://historicseattle.org/events/` — Nonprofit preservation organization with property tours, lectures, advocacy events, and building history programs across Seattle.

Investigated 2026-06-11:
- SiteGround captcha (`sg-captcha: challenge` header) blocks automated access; returns HTTP 202 with `x-robots-tag: noindex`
- No ICS feed visible from the public-facing pages
- Marked blocked pending browserbase support

Re-investigated 2026-06-29:
- ICS endpoint now returns HTTP 200 with valid VCALENDAR (SiteGround captcha no longer blocking)
- `https://historicseattle.org/events/?ical=1` returns 1+ upcoming event (Tribe Events plugin ECPv6.16.2)
- Implemented as `sources/external/historic-seattle.yaml`
- 1 event confirmed in local build: "Historic Talks in Historic Buildings with Feliks Banel" (July 14, 2026)

Proxy escalation 2026-07-14:
- 3 consecutive outofband failures (HTTP 403: Forbidden, last 2026-07-13)
- Promoted from `outofband` → `browserbase` per pendingProxyVerification queue
- Note: ICS feed fetched successfully from this residential IP during testing (1 VEVENT), but 3 consecutive outofband run failures triggered automatic escalation
