---
name: "Add-a-Ball Amusements"
status: added
pr: 1061
platform: "Recurring (static page prose, no dated feed)"
url: https://add-a-ball.com/events/
tags: ["Gaming", "Fremont"]
firstSeen: 2026-07-29
lastChecked: 2026-07-30
---

Pinball arcade in Fremont (315 N 36th St, Seattle, WA 98103).

Investigated 2026-07-29:
- `/events/` returns HTTP 200, static WordPress page (not JS-rendered, no
  Tribe Events/ICS plugin detected)
- Page text describes a fixed weekly cadence: "Weekly Round Robin
  tournaments: Wednesday @ 8:00PM, $5 buy-in" — not a per-event dated
  listing
- Fits the `sources/recurring/` pattern (single weekly schedule, similar
  to the trivia-night entries) rather than a ripper — no ripper code
  needed, just a YAML schedule entry
- Not implemented this cycle (one-source-per-cycle rule; Seattle Tech
  Mixer picked instead as the higher-confidence built-in-type source)

Implemented 2026-07-30: added `sources/recurring/add-a-ball-amusements.yaml`
with a single `every Wednesday` 20:00 PT2H schedule entry, `cost: 5`, and
`tags: [Gaming, Fremont]`. Address confirmed via Nominatim — exact OSM POI
match (`node/2565919678`, `leisure=amusement_arcade`, name "Add-a-Ball") at
47.6520035, -122.3549055.

**Existing coverage check (code review, 2026-07-30):** `sources/seattle_showlists`
already carries a non-`skip` calendar entry for this venue (`name: add-a-ball`,
same OSM node `2565919678`), pulling **28 real touring-band shows** from the
showlists aggregator feed at time of check — zero overlap with the hand-coded
weekly Round Robin tournament (verified by diffing `SUMMARY` values in both
generated `.ics` outputs; showlists titles are band lineups like "Zookraught,
The Snares, Acapulco Lips", never the tournament). This is genuinely
complementary coverage, not a duplicate: the venue's own site has no
scrapable per-show feed (prose-only), so this recurring entry adds the one
thing showlists can't — the tournament's fixed schedule — while showlists
keeps surfacing the touring acts. Per AGENTS.md's "prefer venue sites over
showlists" rule, `skip: true` is for when a dedicated ripper **replaces**
showlists' coverage of a venue; that doesn't apply here since neither source
substitutes for the other, so the showlists `add-a-ball` entry is intentionally
left as-is. The two sources' venue entries do carry the same address, so
`venues.json` will show two cards for this location (a known, accepted
tradeoff of `venues.json` not deduping across sources by geo) until a
cross-source venue-merge feature exists.
