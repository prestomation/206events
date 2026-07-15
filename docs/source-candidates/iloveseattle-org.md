---
name: iLoveSeattle.org
status: blocked
platform: Unknown (WAF-protected)
url: https://iloveseattle.org/all-events/
tags: [Community]
firstSeen: 2026-07-15
lastChecked: 2026-07-15
pr:
---

Community events calendar aggregator. Both the events page and a
Tribe-Events-style `?ical=1` probe returned `HTTP 403` from a generic
WAF (title "403 - Forbidden", not Cloudflare-branded) when fetched
directly — blocked even from this environment, not just CI, so it
isn't stageable for proxy testing per the skill's rules. Re-check later
in case the WAF rule changes or a feed URL surfaces.
