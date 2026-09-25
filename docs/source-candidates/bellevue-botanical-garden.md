---
name: "Bellevue Botanical Garden"
status: blocked
platform: Squarespace (sgcaptcha)
url: https://bellevuebotanical.org/calendar/
tags: []
firstSeen: 2026-09-25
lastChecked: 2026-09-25
---

Bellevue Botanical Garden's own nonprofit-run calendar (distinct from
`sources/external/uw-botanic-gardens.yaml`, which covers UW's separate
Washington Park Arboretum / botanic gardens program). King County,
secular.

Checked 2026-09-25: `GET /calendar/?format=json` returns a
`meta http-equiv="refresh"` redirect to
`/.well-known/sgcaptcha/?r=...` — a SiteGround JS bot-challenge page,
not JSON. Blocked from this environment the same way as other
sgcaptcha-protected sources (`earshot-jazz`, etc.) — would need the
`browserbase` proxy rung to prove, same as those. Not stageable via the
normal `proxy: "outofband"` path since the block happens even on a
plain fetch, not just from CI. Record for a future proxy-ladder
candidate batch rather than staging blind.
