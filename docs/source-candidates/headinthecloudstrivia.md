---
name: Head in the Clouds Trivia
status: added
platform: Instagram (type: instagram)
url: https://www.instagram.com/headinthecloudstrivia/
tags: [Trivia]
firstSeen: 2026-06-05
lastChecked: 2026-06-06
pr: 492
---

First user of the new `instagram` ripper type (see `docs/instagram-source.md`).
Seattle pub-trivia host founded by two Jeopardy! champions; runs at ~12 bars
across the city. Mobile/multi-venue, so the source is `geo: null`.

Enabled in PR #492 once the `instagram-source` skill seeded real upcoming events
into the committed `instagram-cache.json`. The cache is seeded out of band (the
mobile web API is reachable from a residential IP, a server IP, and the web
sandbox — see the skill) and committed via PR; no workflow fetches Instagram.

Note: this account is mostly a *recurring weekly* host, which would normally fit
`sources/recurring/`. It's the example here because the user named it; the
`instagram` type is most valuable for accounts that post **one-off dated events**
(popups, special nights) with no other web presence.
