# 2026-08-05 Discovery Log (social source discovery)

## Social source discovery: r/SeattleEvents

- Feed: 25 posts (5 new since last run on 2026-08-04)
- ❌ Skipped (not an event source): Kindred Spirits — matchmaking/singles service at `kindred-spirits-seattle.vercel.app` — a form-based intro service with no event calendar or structured event data (via [Reddit post](https://old.reddit.com/r/SeattleEvents/comments/1vf1bpv/single_in_seattle_kindred_spirits_v20_is_here/))
- ❌ Skipped (one-off festival): Ananda Mela — annual festival of India at Redmond City Hall, `anandamela.org` — single-weekend festival (Aug 8-9 2026), running since 2010 but only one event per year. No ongoing event calendar on the site. Not enough volume for a dedicated source (via [Reddit post](https://old.reddit.com/r/SeattleEvents/comments/1vfhrkq/ananda_mela_festival_of_india_in_redmond_8889_at/))
- ❌ Skipped (one-off festival): In The Spirit Festival — 21st annual Native arts festival at Washington State History Museum in Tacoma, `washingtonhistory.org/event/in-the-spirit-festival-2026/` — single-day event (Aug 8 2026). The museum's events page (`washingtonhistory.org/events/`) shows only 1-2 events at a time, not enough volume for a dedicated ripper. Also Tacoma-based, outside our primary Seattle coverage area (via [Reddit post](https://old.reddit.com/r/SeattleEvents/comments/1vfhphq/native_american_festival_in_tacoma_88/))

No new candidates this run.

## Source discovery: music venues, bookstores, brewery releases, running clubs, pottery/ceramics, fiber arts, dance, nightlife, city.gov, escape rooms/trivia

Ran `dead-sources.py` first — 2 zero-event calendars this snapshot
(`external-earshot-jazz`, `external-el-centro-de-la-raza`), 0 external
failures. Both are existing `browserbase`-proxy sources; no evidence of
a 30+ consecutive day dead pattern from a single snapshot, so nothing
newly flagged `dead`.

Ran ~15 web searches across a wide rotation of verticals. As in every
recent cycle, the large majority of leads are already covered by an
existing ripper/external/recurring source or already tracked in
`docs/source-candidates/` (524 files going in) — this project remains
very thoroughly mined:

- ❌ Skipped (already covered): Reuben's Brews, Fremont Brewing, West
  Seattle Runner, Seattle Running Club, Elliott Bay Book Co, Third Place
  Books, Easy Street Records, Sonic Boom Records, West Seattle Nursery,
  Pottery Northwest, The Clay Corner, Gasworks Brewing, Salsa Con Todo,
  Go Latin Dance Seattle, Baila District — all already `added` sources
  or existing tracked candidate files, no status change
- 💡 Candidate: **Saltstone Ceramics** (Wallingford ceramics studio) —
  Shopify `/products.json` confirmed live (200, 50 products), but the
  catalog mixes dated multi-week class series (schedule embedded in the
  title text) with plain retail merchandise. Needs a custom JSON scraper
  to filter class-tagged products and parse the day/time/date-range out
  of titles — no built-in `shopify` ripper type exists in this repo yet.
  See `docs/source-candidates/saltstone-ceramics.md`.
- 💡 Candidate: **Nudibranch Coffee** (Capitol Hill, Seattle's first Thai
  coffee shop, opened Feb 2026) — confirmed Squarespace `/events`
  collection responds 200, but `upcoming`/`items` are both empty at time
  of check despite press coverage describing it as having a "sometimes
  event and performance space." Re-check next cycle once events are
  posted.
- 🔍 Investigating: **Seatown Pottery** (3 Seattle locations — Green
  Lake, Capitol Hill, Madison Park) — Webflow marketing site, booking
  handled by third-party SaaS `24hrpottery.com`; haven't yet checked
  whether that platform exposes a public event-listing API.
- 🔴 Blocked: **Potterings** (West Seattle/Alki hand-building studio) —
  plain `curl` with a UA header returns a bare HTTP 403 from this
  environment; per the "fails locally too" rule, not staged for proxy
  testing.
- ❌ Not viable: **Yu Tang Ceramics** — Squarespace site with no dated
  events collection, only static semester registration blocks.
- ❌ Not viable (regional, not Seattle): **Needlehook** — PNW-wide fiber
  arts community calendar; ICS export works, but the only 2 events
  currently in the feed are both in Bellingham, WA.
- ❌ Not viable (outside Seattle): **Northwest Yarns & Mercantile**
  (Bellingham, WA) and **Salsaymotion / Bravo Dance School** (Bellevue,
  WA) — both entirely outside the city, not overflow events from an
  otherwise-Seattle venue.

No source cleared the implementation bar this cycle (built-in-type feed
confirmed working with events > 0, or custom-scrape target confirmed
reachable with live data and no filtering ambiguity) — Saltstone
Ceramics is the most promising lead but needs custom title-parsing work
next cycle.