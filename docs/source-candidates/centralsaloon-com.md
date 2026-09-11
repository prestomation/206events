---
name: LOCAL BANDS MUSIC VIDEO NIGHT
status: blocked
platform: WordPress (unknown events plugin — blocked before it could be identified)
url: https://centralsaloon.com/events/local-bands-music-video-night-2/
tags: ["music", "nightlife", "film"]
firstSeen: 2026-08-25
lastChecked: 2026-09-11
---

Discovered via aggregator gap analysis. 2 events in the Seattle
metro sample. Source domain: centralsaloon.com.

Sample event: "LOCAL BANDS MUSIC VIDEO NIGHT" (2026-08-25T02:00:00.000Z)
Description: Free Monday night music video night at Central Saloon. Curated local music videos playing on the big screen with food & drink specials. No cover, 21+.

**2026-09-11:** Re-checked. `centralsaloon.com/events/` (and `?ical=1`)
both return a SiteGround `sgcaptcha` JS bot-challenge page even from
this environment — a plain fetch can never pass it. Per the
JS-challenge shortcut this would skip straight to a `browserbase`
proxy rung, but the pipeline behind the challenge has never been
seen/verified, so there's nothing to stage yet. Flipped
`candidate` → `blocked`.
