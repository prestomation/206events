# 2026-08-08 Discovery Log (source discovery)

## Source discovery: comedy, outdoors, bookstores, ICS feeds, new venues, trivia/running, night markets/art walks, climbing gyms, drag/vintage/karaoke/silent disco, arcade/escape rooms/dance/cidery/meadery, neighborhood calendars

Ran `dead-sources.py` first — 9 zero-event calendars and 1 external failure
in the current build snapshot, none showing the sustained 30+ day pattern
that would justify a `status: dead` flag; not flagged.

- 💡 Candidate: Mr. B's Meadery — Squarespace — 32 upcoming events verified via `?format=json` — [mrbsmeadery.com/events](https://www.mrbsmeadery.com/events)
- ❌ Not Viable: Hierophant Meadery — WordPress/Tribe Events ICS feed works, but the venue and its hosted events are based in Freeland, WA (Whidbey Island), not Seattle
- ❌ Not Viable: Improbable Escapes — Shopify `/products.json` has no event products, same pattern as Mox Boarding House; events calendar is a custom unscrapable widget
- ❌ Not Viable: Seattle Restored — city pop-up program with no dated calendar/ICS/API, Instagram-first
- ❌ Skipped (already covered): all other search hits this run matched an existing `docs/source-candidates/` entry or `sources/` ripper — comedy clubs (Club Comedy Seattle, Laughs Comedy Club, Emerald City Comedy Club), climbing gyms (Uplift, Momentum SoDo, Edgeworks, Bouldering Project), night markets (Columbia City, CID, 210 Seattle Night Market), running (Seattle Running Club, West Seattle Runner), bookstores (Elliott Bay, University Book Store, Seattle City of Literature, Seattle Book Club), markets (Seattle Local Markets), Town Hall Seattle, Georgetown Pizza & Arcade, Shorty's Pinball Bar, Jupiter Bar, silent disco (Silent Dance Alki), pinball (Seattle Pinball Map — crowdsourced directory, not an event source, not worth tracking as a candidate)

Verticals rotated away from generic aggregators (EverOut, Do206, AllEvents,
Bandsintown, SeatGeek, Eventbrite discovery pages, city.gov generic
calendars) — these surfaced repeatedly across searches but are out of scope
per the "known aggregator, not a primary source" convention and were not
re-recorded as candidates.
