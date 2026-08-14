---
name: Pony Seattle
status: candidate
platform: Custom HTML
url: https://www.ponyseattle.com
tags: [Nightlife, Capitol Hill]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Capitol Hill gay bar known for dance parties and DJ nights. Events listed on their homepage.

**Findings (2026-08-14):** Live, real bar (1221 E Madison St, Capitol Hill). Site is a
simple custom/static HTML page, not a commercial platform — no Squarespace/Wix widgets
detected. Events are listed as **recurring named nights** ("BOOTS N' CATS" 1st Thursdays,
"QUEEN4QUEEN" 2nd Fridays, etc.) rather than dated one-off events, with the site itself
pointing to Instagram (@ponyseattle) for specific/one-off DJ nights. Best modeled as a
`sources/recurring/` entry with fixed weekly/monthly patterns rather than a live scrape;
Instagram would be needed for one-off specials (handled by the `instagram-source` skill if
desired later).
