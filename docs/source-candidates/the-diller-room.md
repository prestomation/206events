---
name: The Diller Room
status: blocked
platform: unknown
url: https://dillerroom.com/
tags: [Nightlife, Downtown]
firstSeen: 2026-09-08
lastChecked: 2026-09-08
---

Downtown Seattle speakeasy/cocktail bar with live entertainment
programming.

Investigated 2026-09-08:
- `dillerroom.com/` and `dillerroom.com/events` both return **HTTP 403**
  on a direct `curl` fetch (not just via a browser-rendering fetch tool) —
  confirmed hard-blocked, not a rendering issue
- No alternate URL or platform identified before the block was hit

**Verdict**: Blocked — 403 from a plain HTTP fetch means nothing can be
scraped from here without a different approach. Leaving as `blocked`
rather than investigating further; revisit if the site changes hosts/CDN.
