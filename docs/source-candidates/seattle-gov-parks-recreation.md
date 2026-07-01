---
name: "City of Seattle — Parks and Recreation"
status: added
pr: 806
platform: Trumba ICS
url: https://www.seattle.gov/parks/recreation/events-and-attractions/public-meeting-and-events-calendar
tags: [Community, Parks]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

**City of Seattle — Parks and Recreation** — `https://www.seattle.gov/parks/recreation/events-and-attractions/public-meeting-and-events-calendar` — the Seattle Parks & Recreation department's own events calendar: free fitness classes (Tai Chi, Yoga, Zumba), community programs (watch parties, Center City Cinema, ping pong, mahjong), volunteer restoration work parties (litter patrols, habitat restoration), and public/advisory meetings, across parks and community centers citywide.

Investigated 2026-07-01:
- Page embeds a Trumba calendar widget (`$Trumba.addSpud({webName: "parks-recreation", ...})`) — same platform family already used for `seattle-gov-arts`, `seattle-gov-city-wide`, and `seattle-gov-neighborhoods`
- ICS export confirmed working: `https://www.trumba.com/calendars/parks-recreation.ics` — HTTP 200, 500 VEVENTs, 496 with `DTSTART >= 2026-07-01` (Trumba caps the feed at 500 entries; that's a feed-side limit, not a fetch problem)
- Locations resolve to real Seattle parks (Green Lake, Discovery Park, Magnuson Park, Golden Gardens, West Duwamish Greenbelt, Van Asselt Community Center, etc.) — confirms Seattle-focused
- Distinct from the already-implemented `seattle-parks-foundation` (a separate nonprofit, Tribe Events/WordPress ICS) — this is the official city department's own Trumba feed
- `geo: null` (multi-location, citywide) / `sourceRole: aggregator` (matches the existing `seattle-gov-*` family per `docs/cross-source-event-dedup.md`)
- No proxy needed — 200 from sandbox

**Implemented 2026-07-01** as `sources/external/seattle-gov-parks-recreation.yaml` — PR #806. CI preview confirmed 500 events fetched with 0 errors on this source.

**Overlap note:** the PR preview surfaced heavy title-level overlap with the already-implemented `seattle-gov-city-wide` feed (53 of 65 distinct event titles also appear there — e.g. "Chinese Dance", "Dancing til Dusk", "Monday Mahjong", "Magnuson Park Advisory Committee"). This matches the known pattern already documented in `docs/cross-source-event-dedup.md` ("HIGH is dominated by one publisher's overlapping themed sub-feeds ... `seattle-gov-*`") — the city's Trumba system publishes largely the same event pool across themed sub-calendars (arts/city-wide/neighborhoods/parks-recreation), not independent content. The cross-source duplicate-candidate queue picked these up (65 pending pairs) for the duplicate-resolver skill to confirm/merge. Net new distinct content from this feed: ~12 titles not found on city-wide (Big Day of Play, Westcrest/Kingfisher/Orchard Street restoration events, Board of Parks Commissioners subcommittee meetings, etc.), plus the `Parks` tag categorization that `seattle-gov-city-wide` doesn't carry.
