---
name: Head in the Clouds Trivia
status: investigating
platform: Instagram (type: instagram)
url: https://www.instagram.com/headinthecloudstrivia/
tags: [Trivia]
firstSeen: 2026-06-05
lastChecked: 2026-06-05
pr:
---

First user of the new `instagram` ripper type (see `docs/instagram-source.md`).
Seattle pub-trivia host founded by two Jeopardy! champions; runs at ~12 bars
across the city. Mobile/multi-venue, so the source is `geo: null`.

Shipped `disabled: true` with an empty `instagram-cache.json` — Instagram 429s
from CI and from the web sandbox, so the cache must be seeded by the
`instagram-source` skill from a residential IP (or a Claude routine fired from
CI). Flip `disabled` off in the PR that adds the first real cache entries.

Note: this account is mostly a *recurring weekly* host, which would normally fit
`sources/recurring/`. It's the example here because the user named it; the
`instagram` type is most valuable for accounts that post **one-off dated events**
(popups, special nights) with no other web presence.
