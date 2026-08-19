---
name: "Dog Gone Seattle"
status: blocked
platform: Unknown (site protected by SiteGround sgcaptcha JS challenge)
url: https://doggoneseattle.org/category/events/
tags: []
firstSeen: 2026-08-19
lastChecked: 2026-08-19
---

Nonprofit/community site with a dog-friendly-events blog category. Fetching
`/category/events/` returns an HTML shell that immediately redirects
(`meta http-equiv="refresh"`) to `/.well-known/sgcaptcha/...` — a SiteGround
JS bot-challenge, the same pattern documented in AGENTS.md as "skip straight
to the `browserbase` rung" for proxy testing. Since a plain fetch here gets
the challenge page rather than real content, this isn't stageable yet (no
confirmed working pipeline to prove) — recording as `blocked` per the
skill's "fetch fails locally too" rule rather than opening a
`requires-proxy-testing` PR against unverified parsing logic. Revisit if a
non-JS-challenged path (e.g. an RSS feed) is found.
