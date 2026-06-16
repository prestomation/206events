---
name: "Seattle Children's Museum"
status: candidate
firstSeen: 2026-06-08
lastChecked: 2026-06-16
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

Re-checked 2026-06-16: The ICS feed URL returns an SiteGround sgcaptcha JS challenge page (HTTP 200 with JS redirect) — a direct fetch is blocked by bot detection. Would require `proxy: "browserbase"`. The calendar is powered by Tribe Events (confirmed from the JS challenge page which references tribe_events). Implement as `proxy: "browserbase"` external ICS when ready.
