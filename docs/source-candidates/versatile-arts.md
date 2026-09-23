---
name: "Versatile Arts"
status: added
platform: WordPress (JS-rendered calendar widget)
url: https://www.versatilearts.net/calendar/
tags: [Circus, Arts]
firstSeen: 2026-08-31
lastChecked: 2026-09-23
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

**2026-09-23:** Added as `sources/external/versatile-arts.yaml` (`sourceRole: aggregator`, `geo: null`, tags Circus/Arts). The calendar page embeds a public Google Calendar (`6346f29c...@group.calendar.google.com`), so it uses that calendar's public ICS directly. 124 events total in the feed, 31 upcoming (Circus of Steam & Shadows at Georgetown Steam Plant, Carnevolar at Emerald City Trapeze, New Moon shows, etc.).
