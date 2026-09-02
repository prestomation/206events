---
name: DanceUS Seattle Argentine Tango Calendar
status: added
platform: Custom HTML (JSON-LD)
url: https://www.danceus.org/events/argentine-tango/seattle-wa-tango-calendar/
tags: [Dance]
firstSeen: 2026-08-25
lastChecked: 2026-09-02
pr: TBD
---

Discovered via aggregator gap analysis. 7 events in the Seattle
metro sample. Source domain: danceus.org.

Sample event: "Argentine Tango for Absolute Beginners" (2026-08-25T02:00:00.000Z)
Description: Argentine tango class for absolute beginners at Corner Store Studio. 7:00 PM.

**Implemented 2026-09-02** as `sources/danceus_tango` — same platform/markup
as the already-implemented `sources/danceus_swing` (a sibling DanceUS genre
calendar): the listing page embeds a JSON-LD `Event` array (venue name,
lat/lng, description, image, url, but no start time) merged with the
visible `.search-event-card` markup for start time/badge/price, keyed by
event url. Verified live 2026-09-02: 25 upcoming Seattle-locality events
(Sep–Oct 2026) across ~10 distinct venues (Salsa Con Todo, Phinney Center,
Dance Underground, OmCulture, Arthur Murray, Polish Home, China Harbor,
Corner Store Studio, Tango-expertS, Tango En Vie), `sourceRole: aggregator`,
`geo: null`. No overlap with `sources/external/go-latin-dance-seattle.yaml`
(that aggregator covers salsa/bachata/zouk/kizomba only, not tango).
