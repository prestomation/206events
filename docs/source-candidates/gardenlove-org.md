---
name: Garden Love
status: blocked
platform: Unknown (SiteGround-hosted)
url: https://gardenlove.org/
tags: []
firstSeen: 2026-08-30
lastChecked: 2026-08-30
---

Seattle-area garden events aggregator (plant sales, classes, garden
tours across multiple orgs/nurseries) surfaced via a community-garden
search.

Investigated 2026-08-30:
- `curl` from this environment gets an HTTP 202 SiteGround JS
  bot-challenge interstitial (`sgcaptcha`) rather than the page
  content — same block signature seen on other SiteGround-hosted
  candidates (`sodo-bia.md`, `elliott-bay-brewing.md`).
- Not fetchable from here, so nothing to evaluate yet (platform,
  volume, in-city fraction all unknown). Recording as `blocked` per
  the "fetch fails locally → do not implement, do not stage" rule
  rather than guessing at a proxy rung.
