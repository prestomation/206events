---
name: "Cantina del Sol"
status: notviable
platform: Wix
url: https://www.cantinadelsol.com/events
tags: [Nightlife, "Capitol Hill"]
firstSeen: 2026-07-22
lastChecked: 2026-07-22
---

New rooftop Mexican bar on Capitol Hill (opened May 2025, entrance on
Summit Ave). Covered rooftop patio hosts DJ sets (Latin soul, cumbia,
balearic) and a rooftop drag brunch.

Investigated 2026-07-22: confirmed Wix, but unlike El Sueñito Brewing
(also Wix, added this cycle), the fetched static HTML for `/events` has
no `wix-warmup-data` script tag or other embedded event JSON — likely
because this page is a simpler booking/rental page rather than a Wix
Events calendar widget. No static data source found. Would need a
follow-up look at whether a dedicated Wix Events page exists elsewhere
on the site, or JS-rendering to confirm.
