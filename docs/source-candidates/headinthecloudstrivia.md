---
name: Head in the Clouds Trivia
status: notviable
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

**Not viable as an `instagram` source — covered by the recurring sources.** Head
in the Clouds runs ~29 *recurring weekly* trivia nights, already covered
comprehensively (with per-venue geo + map pins) by `sources/recurring/hitc-trivia-*.yaml`.
Investigation in PR #492 (live mobile-web-API fetch + flyer vision) found the
account posts only ~monthly — launch announcements, recaps, and the occasional
**special one-off themed event** (e.g. Survivor 50 Trivia, Heated Rivalry) — and
does **not** publish a per-week theme per venue. So Instagram can't replace the
recurring grid, and there are no weekly themes to harvest.

The `type: instagram` source for this account therefore ships **disabled** with an
empty cache, kept as the canonical reference wiring for the ripper type. The
`instagram` infrastructure (ripper, skill, scripts, committed-cache model) remains
for future accounts that post **one-off dated events** with no other web presence.

Note: this account is mostly a *recurring weekly* host, which would normally fit
`sources/recurring/`. It's the example here because the user named it; the
`instagram` type is most valuable for accounts that post **one-off dated events**
(popups, special nights) with no other web presence.
