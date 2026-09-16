---
name: Easy Speak Seattle
status: added
platform: Recurring (explicit "2nd and 4th Monday" schedule)
url: https://www.westernwashingtonpoetsnetwork.org/home/seattle
tags: [OpenMic, Literary, Wedgwood]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr: TBD
---

Discovered via aggregator gap analysis. 3 events in the Seattle
metro sample. Source domain: westernwashingtonpoetsnetwork.org.

Sample event: "Easy Speak Seattle" (2026-08-25T02:00:00.000Z)
Description: Second and fourth Mondays 7:00-9:00 p.m. at Wedgwood Broiler (banquet room), 8230 35th Ave NE, Seattle. Poem, prose, or song open mic. Doors open 6:30 p.m.

**Implemented 2026-09-16:** Confirmed the "2nd and 4th Monday" schedule and
venue via two independent sources — the WWPN Seattle page
(`/home/seattle`, the original `/海/seattle` URL 404s — WWPN restructured
its Google Sites nav since first discovery) and web search results citing
the same Wedgwood Broiler banquet-room location, 7-9pm, doors at 6:30pm.
The dedicated `easyspeakseattle.com` site is unreachable (expired TLS cert
on HTTPS, empty body on HTTP) so WWPN is the source of record. Added as
`sources/recurring/easy-speak-seattle.yaml` (`schedule: 2nd and 4th Monday`,
matches the existing `1st and 3rd Tuesday` pattern used by
`fremont-abbey-open-mic`). Geocoded via Nominatim, matched directly by venue
name to OSM node `1564280658` (47.6893232, -122.2901818, suburb: Wedgwood).
Tagged `OpenMic` (existing convention), `Literary`, and `Wedgwood`
(registered neighborhood in `city.config.ts`) instead of the aggregator's
looser `["literary", "nightlife", "music"]` guess — this is a poetry/prose
open mic, not primarily nightlife or music.
