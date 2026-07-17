## Source discovery: music venues, beer/taprooms, comedy, summer festivals, new venues, rooftop bars, trivia/karaoke

Dead source check: `skills/source-discovery/scripts/dead-sources.py` — 5
zero-event calendars (`frye-art-museum-frye-art-museum`,
`sam-sam-downtown`, `sam-sam-asian-art`, `sam-sam-sculpture-park`,
`urban-family-brewing-urban-family-brewing`) and 12 external failures, all
`Browserbase fetch failed: HTTP 402` (credit/billing exhaustion, handled
by the out-of-band proxy-escalation queue, not a source problem). A single
snapshot doesn't establish the 30-day pattern required to flag `status:
dead` — no flips this run.

Verticals searched: Seattle live-music venue/new-venue calendars, beer
release/taproom calendars, comedy open-mic calendars, summer 2026
festival calendars, `"Seattle events ICS subscribe"`, newly-opened Seattle
venues, Squarespace rooftop-bar calendars, karaoke/trivia bar calendars
(West Seattle/Ballard).

- 💡 Candidate: **Beveridge Place Pub** — hand-coded recurring entry (no
  ICS/API; static WordPress `/events/` page confirms a fixed weekly
  pattern) — West Seattle beer bar hosting **Quiz Night every Wednesday at
  8pm** — `docs/source-candidates/beveridge-place-pub.md`. 🟡 Medium-low
  tier (single-schedule recurring entry, same pattern as the existing
  `hitc-trivia-*` sources) — queued for a future implementation cycle.
- ❌ Not Viable: **Fast Fashion Brewing (The Masonry)** — Queen Anne/SoDo
  brewery; the venue's own site explicitly punts all event info to
  Facebook ("please see our Facebook events page"), no first-party
  calendar or feed of any kind despite third-party (Washington Beer Blog)
  mentions of a recurring karaoke/dance-party pattern —
  `docs/source-candidates/fast-fashion-brewing-the-masonry.md`.
- ❌ Not Viable: **Flight Club Darts (South Lake Union)** — new
  "Social Darts" venue (opened March 2026); its `/events` page is purely a
  private/corporate-event booking pitch with no dated public listings —
  `docs/source-candidates/flight-club-darts-south-lake-union.md`. Distinct
  from the unrelated Capitol Hill live-music venue of the same name
  already tracked as `notviable`.
- ❌ Already covered (re-surfaced by searches, no action needed): Nectar
  Lounge, The Crocodile, Reuben's Brews, Ounces Taproom & Beer Garden,
  Lucky Envelope Brewing, Seattle Beer Week, Washington Beer Blog (all
  `sources/` or `sources/external/`), Club Comedy Seattle, Emerald City
  Comedy, Comedy Underground (already `sources/`/`sources/external/`), a
  Stir (already `sources/`), Populus Seattle / Firn Rooftop, Woodland Park
  Zoo, RailSpur, Cannonball Arts Center, Picklewood, Next Level Lounge,
  the-beer-junction, headinthecloudstrivia and its many per-venue
  `hitc-trivia-*` recurring entries, Unicorn Seattle trivia, West Seattle
  Blog, Corner Pocket West Seattle (already `notviable` candidates).
- 🔍 Investigating (no change): **Visit Pioneer Square** — re-confirmed
  still returning a SiteGround CAPTCHA challenge (HTTP 403 to this
  environment) on `pioneersquare.org/our-events/`; unchanged from
  2026-05-07, `docs/source-candidates/visit-pioneer-square.md` left as
  `blocked`.

No source implemented this cycle — this run focused on candidate
discovery and list maintenance per the request. Beveridge Place Pub (Quiz
Night) is the highest-confidence new find and is queued as a low-volume
recurring-entry candidate for a future implementation cycle.
