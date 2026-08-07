# 2026-08-07 Source Discovery

## Social source discovery: r/SeattleEvents

- Feed: 25 posts (4 new since last run)
- 💡 Candidate: Rainy Day Artistic Collective — Humanitix — https://events.humanitix.com/rainy-day-artistic-collective-presents-radium-girls (via [Reddit post](https://old.reddit.com/r/SeattleEvents/comments/1vhisj7/avatar_the_last_airbender_trivia/))
- 💡 Candidate: Glitter and Gold Studio — Eventbrite — https://www.eventbrite.com/e/monthly-open-sapphire-mining-night-at-glitter-gold-studio-tickets-1995498852786 (via [Reddit post](https://old.reddit.com/r/SeattleEvents/comments/1vhb21g/montana_sapphire_mining_social_event_at_glitter/))
- ❌ Skipped (social/content): 2 posts had no extractable external event URLs (Reddit internals, imgur links, or social media only)

## Source discovery: community centers, farmers markets, running, new venues, food trucks, tech meetups, board game cafes, distilleries, night markets, climbing gyms, wine, poetry, nonprofits, record swaps

Ran `dead-sources.py` first — 4 zero-event calendars (`on-the-hiyu`,
`seattle-childrens-museum`, `seattledances`, `urban-league-seattle`) and 1
external failure (`west-seattle-blog`), all already tracked as `added` /
`proxy` sources in `docs/discovery-log/dead-sources.md` — no new dead-source
flags needed.

Extensive rotation across verticals turned up almost entirely
already-covered ground (farmers markets, food trucks, board game cafes,
GeekWire, Hugo House, Seattle Uncorked, WWPN, Columbia City Night Market,
Kenyon Hall, Edgeworks/Uplift/Bouldering Project/The Spot climbing gyms,
seattle.gov calendars, RailSpur, Flight Club Darts) — a sign the candidate
backlog here is well-mined. Three genuinely new leads:

- 💡 Candidate: Innervisions Posters & Framing (Open Mic Night) — Eventbrite (`organizerId: 49577348033`, org "Seattle Records") — monthly First Friday open mic, U District — https://www.eventbrite.com/o/seattle-records-49577348033 — 0 live events at time of check; re-verify closer to a First Friday
- ❌ Not Viable: Vertical World (Seattle climbing gym) — the only linked calendar feed (Rock Gym Pro public iCal) returns `Invalid guid`, not a calendar
- ❌ Not Viable: Momentum Indoor Climbing - SODO — events list is JS-rendered client-side, no static HTML or JSON feed
- 🔍 Investigated, already covered: Vertical World-adjacent climbing gym sweep otherwise reconfirmed existing `notviable`/`blocked`/`candidate` files for Edgeworks, Uplift, Bouldering Project, The Spot — no changes needed
- 🔍 Investigated, already covered: farmers markets (all 15+ neighborhood markets already have `sources/recurring/*.yaml`), food trucks (`seattle_food_trucks`), Bite of Seattle, Seattle Street Food Festival, board game cafes (Mox, Blue Highway Games, The Missing Piece, Meeples, Raygun Lounge, PlaytestNW), Columbia City Night Market, Kenyon Hall, seattle.gov calendars (city-wide + arts), RailSpur, Flight Club Darts, GeekWire, Hugo House, Seattle Uncorked, Western Washington Poets Network — all already `added`/`candidate` in `docs/source-candidates/`