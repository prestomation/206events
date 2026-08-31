---
name: "Versatile Arts"
status: investigating
platform: WordPress (JS-rendered calendar widget)
url: https://www.versatilearts.net/calendar/
tags: [Circus, Arts]
firstSeen: 2026-08-31
lastChecked: 2026-08-31
---

Self-described "Seattle-Area Circus Events" hub — a community calendar
that other circus orgs/producers can submit events to (per the page's
"email us" invite).

Investigated 2026-08-31: `/calendar/` returns HTTP 200 but the static
HTML has no event listings at all — just nav chrome and an "Upcoming
Events" heading (166 lines total). No JSON-LD, ICS export, or REST
endpoint with event data found; the actual calendar content is loaded
client-side. Would need a JS-capable/browser fetch to evaluate real
event volume before a viability call. Worth a follow-up if it becomes a
priority — as a curated aggregator of smaller circus orgs (SANCA,
Emerald City Trapeze, etc.) it could be a useful catch-all if reachable.
