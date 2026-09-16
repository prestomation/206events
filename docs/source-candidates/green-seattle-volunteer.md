---
name: Green Seattle Volunteer
status: added
platform: Unknown
url: https://greenseattle.org/get-involved/volunteer
tags: [Volunteering]
firstSeen: 2026-08-14
lastChecked: 2026-09-16
---

Green Seattle Partnership volunteer events for forest and park restoration throughout Seattle.

Blocked: every direct fetch (WebFetch and curl) returns an sgcaptcha
(SiteGround) bot-challenge redirect (`/.well-known/sgcaptcha/?r=...`)
instead of page content. Can't assess platform, event volume, or
dates until fetched via proxy. Not yet checked against `sources/` for
existing coverage.

**2026-09-16:** Superseded — this `greenseattle.org` marketing domain was
never the right fetch target (still sgcaptcha-blocked). The org's actual
event data lives on `seattle.greencitypartnerships.org`, tracked
separately in `docs/source-candidates/seattle-greencitypartnerships-org.md`
and implemented as `sources/green_seattle_partnership/`. See that file
for the canonical record.
