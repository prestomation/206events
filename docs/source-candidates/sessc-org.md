---
name: Open Weaving Studio
status: blocked
platform: Unknown (SiteGround-hosted)
url: https://sessc.org/event/open-weaving-studio-2-2/2026-08-25/
tags: []
firstSeen: 2026-08-25
lastChecked: 2026-08-30
---

Discovered via aggregator gap analysis. 12 events in the Seattle
metro sample. Source domain: sessc.org (SouthEast Seattle Senior Center,
Rainier Valley).

Sample event: "Open Weaving Studio" (2026-08-25T16:00:00.000Z)
Description: Learn to weave or spin with us! Open Studio Weaving is available every day. The post Open Weaving Studio appeared first on SouthEast Seattle Senior Center .

**Follow-up (2026-08-30):** Re-surfaced independently via a fresh "senior
center events" search. The event URL pattern (`/event/<slug>/<date>/`)
looks like WordPress Tribe Events, so tried `sessc.org/events/?ical=1` —
gets an HTTP 202 SiteGround JS bot-challenge interstitial (`sgcaptcha`)
instead of an ICS body. Not fetchable from here; `candidate` → `blocked`
rather than guessing a proxy rung.
