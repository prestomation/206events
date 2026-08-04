# 2026-08-04 Discovery Log (source discovery)

## Source discovery: Georgetown/SoDo business districts, Rainier Valley/Othello, distilleries, Latin dance studios, West Seattle Junction

Ran `dead-sources.py` first — 1 zero-event calendar this snapshot
(`frye-art-museum-frye-art-museum`), 0 external failures. Cross-checked
the discovery-log history: `frye-art-museum` has appeared in the
dead-sources output intermittently since 2026-07-17 (roughly half the
daily runs in that window show it at 0, the other half don't), which
means it does **not** meet the "0 events for 30+ **consecutive** days"
bar — it reads as a low/intermittent-programming museum calendar, not a
broken pipeline. Consistent with every recent cycle's call on this same
source; nothing newly flagged `dead` today.

Searched 6 queries across verticals not recently rotated: Georgetown
business-association calendars, Rainier Valley/Othello neighborhood
orgs, Seattle distillery tasting rooms, salsa/bachata dance-studio
socials, West Seattle Junction/Alki, and SoDo warehouse district — plus
3 follow-up searches (brewery/taproom Eventbrite listings, Rainier
Valley chamber, vinyl record store in-store events). As in every recent
cycle, the large majority of leads are already covered by an existing
ripper/external/recurring source or already tracked in
`docs/source-candidates/` (520 files going in):

- ❌ Skipped (already covered): Georgetown Business Association
  (`sources/external/gba-georgetown.yaml`), Georgetown Farmers
  Market/Carnival/Garden Walk/Steam Plant/Community Council/Pizza &
  Arcade (all existing tracked files, no status change), Salsa Con Todo
  (`notviable`, Wix, re-confirmed no change), Baila District
  (`investigating`, re-confirmed no change), GO Latin Dance Seattle
  (`added`, already aggregates Salsa Con Todo/Baila District/Reverie
  Ballroom events via its own Tribe ICS feed), West Seattle Junction FC
  (`added` — soccer club, distinct org from the West Seattle Junction
  Association below), Easy Street Records (`blocked` — DICE venue name
  unresolved, re-confirmed no change), Seattle Book Club (`investigating`
  — distinct entity from "West Seattle Book Club" mentioned on
  wsjunction.org, not re-investigated today)
- ❌ Not viable (this pass): Othello Park Alliance
  (`docs/source-candidates/othello-park-alliance.md`) — WordPress
  history/fundraising page, no calendar plugin or feed; single annual
  festival, same category as other excluded single-annual-event fairs.
  Rainier Chamber of Commerce
  (`docs/source-candidates/rainier-chamber-of-commerce.md`) — Wix
  client-rendered site (same pattern already ruled out repeatedly in
  this repo), thin content (one recurring internal meeting + occasional
  awards breakfast) even if it were reachable.
- 🔄 Status fix: West Seattle Summer Fest — re-confirmed `notviable`
  (checked the Association's broader `/event-directory/` page this
  time, not just the Summer Fest page; still no ICS/API anywhere on
  `wsjunction.org`), `lastChecked` bumped to today; no status change.
- Distillery vertical (Westland, Copperworks, Old Log Cabin, Glass
  Distillery) and generic brewery/taproom Eventbrite search: no
  first-party structured event feed surfaced for any distillery beyond
  tour-booking pages; nothing new to track as a candidate file this
  pass.

Two genuinely new leads cleared the quality gate:

- 💡 **Candidate: SODO Business Improvement Area** — External ICS —
  `docs/source-candidates/sodo-bia.md`. Confirmed WordPress + The Events
  Calendar (Tribe) plugin; the full-query ICS export
  (`https://sodoseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list`,
  found via the page's own "subscribe" webcal links — the naive
  `/events/?ical=1` URL only returns a partial 5-event slice) returned a
  valid `VCALENDAR` with 19 `VEVENT`s: recurring Transportation/
  Engagement/Clean & Safe community meetings, National Night Out,
  Coffee Hour, and a Q4 Business Networking Event. Note: the plain-UA
  `curl -I` this project's scripts default to got a 403 from
  `sodoseattle.org/events/`, but a browser-style UA got 200 — worth
  re-testing with the project's standard UA string before assuming it
  needs a proxy rung.
- 💡 **Candidate: West Seattle Junction Harvest Fest** — recurring-YAML
  candidate (not a ripper — no feed exists) —
  `docs/source-candidates/west-seattle-harvest-fest.md`. Found via the
  West Seattle Junction Association's `/event-directory/` page (same
  static-content org as the already-`notviable` Summer Fest), but with
  a genuinely clean, verified 3-year "last Sunday in October" date
  pattern (2024 Oct 27, 2025 Oct 26, 2026 Oct 25 per current site copy)
  — same confidence bar as `sources/recurring/cid-night-market.yaml`.

No source cleared the bar for direct implementation this cycle (both
new leads need follow-up: SODO BIA needs a confirmed venue address for
`geo` before writing the external-calendar YAML, and Harvest Fest needs
a `sources/recurring/` entry with an anchor point in The Junction) —
flagging both as high-confidence `💡 candidate` for the next
implementation pass rather than rushing either without a config-ready
`geo`.
