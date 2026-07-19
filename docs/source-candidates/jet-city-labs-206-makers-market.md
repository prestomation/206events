---
name: Jet City Labs (206 Maker's Market)
status: blocked
platform: unknown
url: https://jetcitylabs.com/pop-up-markets/
tags: [MakersMarket, "West Seattle"]
firstSeen: 2026-07-19
lastChecked: 2026-07-19
pr:
---

1,000 sq ft creative/event space in West Seattle's Junction
neighborhood running the "206 Maker's Market" pop-up series roughly
every two weeks (Feb–Jun 2026 dates listed via EverOut: Feb 15, Mar 1,
Mar 15, Apr 5, Apr 19, May 3, May 17, Jun 7, Jun 21).

Investigated 2026-07-19:
- Direct fetch of `/pop-up-markets/` returns HTTP 403 with a custom
  "403 - Forbidden" WAF page (not a standard nginx/Apache default),
  and a JS-rendering fetch of the same URL also came back empty —
  blocked to both fetch paths available in this environment
- Per the source-discovery quality gate, a non-200 in Claude Code web
  means "blocked here; record it as status: blocked and move on" —
  not staged for proxy testing, since we haven't confirmed the pipeline
  works from any environment yet
