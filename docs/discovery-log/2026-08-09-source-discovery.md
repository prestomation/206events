# 2026-08-09 Discovery Log (source discovery)

## Source discovery: music venues, art galleries, beer/brewery, community centers, vintage/pop-up markets, board games/axe throwing, new venues, burlesque/circus

Ran `dead-sources.py` first — 7 zero-event calendars and 1 external failure
(`west-seattle-blog`) in the current build snapshot, none showing a
sustained 30+ day pattern; not flagged as dead.

- 🔄 Status fix: Mr. B's Meadery — re-verified live `?format=json` (32
  upcoming events, real future epoch timestamps) — implemented this cycle,
  see PR #1154
- ❌ Skipped (already covered): all other search hits this run matched an
  existing `docs/source-candidates/` entry or `sources/` ripper — live
  music aggregators (SeatGeek, ConcertFix, Songkick, Live Music Project),
  art galleries (Gallery 110, SeattleArtists.com, EverOut visual-art),
  breweries (Reuben's Brews, Fremont Brewing — both already ripped),
  community centers (The Center for Active Living/wscenter.org — SiteGround
  bot-check wall, no calendar data reachable), vintage/pop-up markets
  (Seattle Local Markets, Seattle Restored — both `notviable`), board games
  (Meeples Games — `blocked`, The Missing Piece — already `added`), axe
  throwing (Blade & Timber — `notviable`, Netlify SPA), new venues (Flight
  Club Seattle — already tracked as candidate), burlesque/circus (EverOut
  aggregator categories only, no new dedicated venue found)

Verticals rotated away from generic aggregators (EverOut, Do206, AllEvents,
SeatGeek, Songkick, ConcertFix, Eventbrite discovery pages) per the
"known aggregator, not a primary source" convention.
