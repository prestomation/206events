---
name: "Sea Monster Lounge"
status: added
platform: Wix (embedded warmup JSON)
url: https://www.seamonsterlounge.com/buy-tickets-in-advance
tags: [Music, Wallingford]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---
Live music venue at 2202 N 45th St, Wallingford, Seattle. Hosts nightly touring and local acts.

Investigated 2026-07-01:
- Wix site confirmed; no public REST API, but the events page embeds a full-page SSR warmup blob in `<script type="application/json" id="wix-warmup-data">`, directly `JSON.parse`-able
- Event data lives at a fixed path within that blob (`appsWarmupData[<events-app-id>]["widgetcomp-kxpbo2ev"].events.events`) with structured title/description/scheduling (ISO start/end)/location/image fields — no scraping of rendered HTML needed
- Confirmed via live fetch: 66 upcoming events (Jul–Aug 2026), e.g. "X-Ray & Friends" (Jul 1), "Stingshark" (Jul 9 & 16), "Sea Monster P-Funk Tribute & 4th of July Celebration Show" (Jul 4)
- No ticket price signal in the feed — `cost` intentionally omitted rather than guessed
- Not a duplicate of `sources/external/go-latin-dance-seattle.yaml` (which only carries Latin-dance-social nights hosted at this venue among several others) — this source covers the venue's own full nightly music calendar; cross-source dedup will reconcile any overlapping events

Implemented as a custom `IRipper` (`sources/sea_monster_lounge/ripper.ts`) — PR TBD.
