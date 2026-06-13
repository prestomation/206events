---
name: "Seattle Children's Museum"
status: candidate
firstSeen: 2026-06-08
lastChecked: 2026-06-08
tags: [Kids, Museums]
---
Seattle Children's Museum, at Seattle Center (305 Harrison St, Seattle, WA 98109).
Calendar at https://seattlechildrensmuseum.org/calendar/

HTTP 403 from this web environment (host_not_allowed network policy) — not
confirmed blocked from CI or normal IP. Needs fetch validation from a
non-restricted environment.

The site shows iCalendar export options on the calendar page; check for:
- ICS feed: `https://seattlechildrensmuseum.org/?post_type=tribe_events&ical=1&eventDisplay=list`
- Or look for a subscribe/export link on the calendar page directly
