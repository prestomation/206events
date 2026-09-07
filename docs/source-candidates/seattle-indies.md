---
name: "Seattle Indies"
status: added
platform: WordPress/Tribe Events ICS
url: https://seattleindies.org/events/
tags: [Gaming, Tech, Community]
firstSeen: 2026-06-20
lastChecked: 2026-09-07
pr: 691
---

**Seattle Indies** — `https://seattleindies.org/events/` — Seattle's independent game developer community organization hosting monthly meetups, showcases, playtesting clubs, co-working sessions, and regional social events.

Investigated 2026-06-20:
- WordPress.com site with The Events Calendar plugin (`x-tec-api-root: https://seattleindies.org/wp-json/tribe/events/v1/`)
- Tribe Events ICS feed at `/?post_type=tribe_events&ical=1&eventDisplay=list` returns 200 OK with 30 upcoming events
- ~19 events in Seattle proper; remaining are online (10) or regional socials in Auburn, Bremerton, Tacoma (1-3 each)
- Primary Seattle venues: Academy of Interactive Entertainment (305 Harrison St, Seattle Center), Phoenix Comics and Games (113 Broadway E), Stoup Brewery, Chuck's Hop Shop, Hugo House, Watershed Pub
- No proxy required (WordPress.com — accessible from GitHub Actions)
- Organization is Seattle-based; primarily serves Seattle indie game dev audience
- Not covered anywhere else in the repo

Implemented as `sources/external/seattle-indies.yaml` with `geo: null`, `sourceRole: venue`, tags `Gaming`, `Tech`, `Community`.

## 2026-09-07 — staged for proxy testing

The ICS feed began returning `HTTP 403` from GitHub Actions runners (surfaced
in `externalCalendarFailures`, and tracked in `pendingProxyVerification`). It
returns `HTTP 200` from a residential IP, so this is the usual "CI's IP is
blocked, everywhere else works" pattern rather than a dead feed.

Staged at `proxy: outofband` — the ladder entry point — and deliberately left
**unmerged** with the `requires-proxy-testing` label, per
`skills/source-discovery/SKILL.md`. The out-of-band job's proxy-escalation
(Mode A) tests the ladder from the residential environment and merges the
lowest rung that works, climbing to `browserbase` if `outofband` also fails, or
closes the PR if neither does.
