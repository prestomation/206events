---
name: "iLoveSeattle.org"
status: blocked
platform: Unknown (SiteGround-hosted WordPress, presumed)
url: https://iloveseattle.org/all-events/
tags: []
firstSeen: 2026-09-01
lastChecked: 2026-09-01
pr:
---

Seattle community events calendar surfaced via a general "Seattle
community center events calendar" search.

Investigated 2026-09-01: a plain fetch of `/all-events/` returns HTTP 202
with a `meta http-equiv="refresh"` redirect to
`/.well-known/sgcaptcha/?r=...` — the same SiteGround JS bot-challenge
signature already seen and recorded as `blocked` for International
Examiner, SouthEast Seattle Senior Center, and Garden Love (see
2026-08-30 discovery log). No structured data reachable from this
environment. `status: blocked`.
