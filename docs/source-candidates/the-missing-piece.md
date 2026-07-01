---
name: "The Missing Piece"
status: candidate
platform: "WordPress / The Events Calendar (Tribe Events) REST API"
url: https://www.themissingpiecegames.com/events/
tags: [Gaming, "West Seattle"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

**The Missing Piece** — `https://www.themissingpiecegames.com/events/` — West Seattle board game café at 4707 California Ave SW B (Alaska Junction). Hosts near-daily community game nights: Scrabble Night, American Mah Jongg, Dungeons & Dragons, Friday Night Magic, casual TCG play, plus occasional ticketed release events (One Piece, Digimon).

Investigated 2026-07-01:
- WordPress confirmed, running The Events Calendar (Tribe Events) plugin
- Public REST API confirmed working: `https://www.themissingpiecegames.com/wp-json/tribe/events/v1/events?per_page=50&page=N`
- 71 total upcoming events across 2 pages at time of check, spanning July–August 2026
- 16 distinct recurring event types (Scrabble Night, Mah Jongg, D&D, Friday Night Magic, Party Games, etc.), single fixed venue
- `cost_details.values` gives clean numeric price data for the few ticketed release events ($35 flat, or "Free – $5/$6.50" jigsaw puzzle races); most events have no cost set (free walk-in game nights)
- No built-in ripper `type` exists for Tribe Events REST API — implemented as a custom `JSONRipper` subclass (pattern similar to `downtown_seattle_association`, which also uses the Tribe Events API but with venue-based pagination; this source is single-venue so pagination is simpler)
- geo confirmed via OpenStreetMap: node 441028241 (shop=games, "The Missing Piece"), 47.5608924, -122.3872868
- Not previously covered: Missing Piece is a different venue from `meeples-games.md` (blocked, SiteGround captcha) and `mox-boarding-house*` — no overlap
