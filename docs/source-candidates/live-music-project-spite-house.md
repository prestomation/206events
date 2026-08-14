---
name: Live Music Project Spite House
status: investigating
platform: Unknown
url: https://www.livemusicproject.org/events/performers/7917/spite-house
tags: [Music]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Spite House venue listing on Live Music Project's Seattle classical and new music calendar.

**Findings (2026-08-14):** Blocked. Both WebFetch and a direct `curl` (with a browser UA)
get HTTP 403 with a Cloudflare `cf-ray` header — Cloudflare bot protection, not a dead site.
Also worth noting: this candidate targets one venue's page *within* the Live Music Project
aggregator, rather than Live Music Project itself as a citywide source — if unblocked, it may
be worth evaluating the aggregator's full calendar instead of one venue subpage. No dedicated
"Spite House" ripper found in `sources/` (a substring match on "spite" elsewhere in the repo
is incidental, from words like "despite"). Needs a proxy or different fetch path to evaluate
further.
