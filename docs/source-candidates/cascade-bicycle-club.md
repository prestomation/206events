---
name: "Cascade Bicycle Club"
status: added
firstSeen: 2026-06-10
lastChecked: 2026-06-11
tags: [Sports, Community]
pr: 606
---
**Cascade Bicycle Club** — `https://cascade.org/rides-events` — Seattle's major cycling club with 100+ events: major rides (Seattle to Portland, Emerald City Ride, RSVP), free group rides, and community events.

Investigated 2026-06-10:
- Drupal CMS (custom, no standard ICS/iCal export found)
- No Tribe Events plugin; no `/jsonapi/` endpoint confirmed
- Main events URL: `https://cascade.org/rides-events` (note: `cascade.org/events` 404s)
- Events use URL pattern `/rides-events/[slug]`
- 200 OK accessible; large volume of events

Investigated 2026-06-11:
- Drupal Views AJAX endpoint confirmed working: `POST /views/ajax`
- Form params: `view_name=rides_events_search`, `view_display_id=mainblock`, `view_path=/node/17`, `pager_element=0`, `page=N`, `_wrapper_format=drupal_ajax`
- Response: JSON array with `{"command":"insert","data":"<html>"}` command containing event cards
- Event cards: `.card-sm-event` class; ISO 8601 datetimes in `time[datetime]` attributes
- Event links: `a.card-overlay-link[href="/rides-events/\d+"]` — present for ~7/21 events per page; others (NERD rides, informal series) have no individual pages
- Facet counts: Free Group Ride (69), Single Day Ride (3), Multiday Tour (3), Multiday Century (2), Community Event (1) ≈ 78 total events
- ~21 events per page across ~4 pages
- Per-event meeting addresses available on individual event pages; list-view shows region only ("North Seattle")
- Implementation: Custom `IRipper` needed (POST-based AJAX, Cheerio HTML parsing)
- No proxy needed; accessible from GitHub Actions
