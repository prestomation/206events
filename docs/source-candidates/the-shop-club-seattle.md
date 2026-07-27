---
name: "The Shop Club Seattle"
status: blocked
platform: Unknown (SiteGround-hosted, sgcaptcha)
url: https://theshopclubs.com/seattle/events/
tags: [Cars, SoDo]
firstSeen: 2026-07-27
lastChecked: 2026-07-27
---

"Country club for gearheads" — members-only car/motorcycle enthusiast club at
2233 6th Ave S (SoDo), home to the Derby restaurant. Hosts weekly "Cars and
Coffee" (Saturdays) and "Bikes and Brunch" (Sundays) plus one-off events
(Lowriders & Brunch, themed car builds).

Checked the live events page 2026-07-27:
`curl -sI https://theshopclubs.com/seattle/events/` returns HTTP 202 with a
`sg-captcha: challenge` header and a meta-refresh to
`/.well-known/sgcaptcha/?...` — a SiteGround JS bot-challenge page, not the
real content. Same class of block as `earshot-jazz`/`historic-seattle` (see
`docs/proxy-verification.md`). Per the source-discovery skill's local-fetch
rule, a source that returns a CAPTCHA even from the Claude Code environment
is not stageable for proxy testing — recording as `blocked` rather than
opening a `requires-proxy-testing` PR.
