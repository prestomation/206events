---
name: Trivia at Jules Maes Saloon
status: notviable
platform: Unknown
url: https://trivianearme.net/seattle/venues/jules-maes-saloon
tags: ["board-games", "nightlife"]
firstSeen: 2026-08-25
lastChecked: 2026-09-17
---

Discovered via aggregator gap analysis. 32 events in the Seattle
metro sample. Source domain: trivianearme.net.

Sample event: "Trivia at Jules Maes Saloon" (2026-08-25T02:00:00.000Z)
Description: Trivia every Monday at 7pm. Free to play with prizes. Oldest bar in Seattle, opened in 1888 in Georgetown neighborhood.

**Investigated 2026-09-17, not viable as a new aggregator source.** The
listing page (`trivianearme.net/seattle`) embeds a full JSON-LD `ItemList`
of 107 venues (name/address/free-text schedule description per venue) —
technically scrapable — but cross-checking a sample of the venue names
against `sources/recurring/` shows the Seattle-proper venue set is already
comprehensively covered: `jules-maes-saloon.yaml` (the very venue this
candidate names), plus ~35 more `hitc-trivia-*.yaml` /
`admiral-pub-trivia.yaml` / `elysian-capitol-hill-trivia.yaml` /
`octopus-bar-monday-trivia.yaml` / etc. entries covering Bizarre Brewing,
College Inn Pub, Fiddler's Inn, Figurehead Stone Way, Great Notion
Ballard/Georgetown, Beveridge Place Pub, Admiral Pub, and most other
venues sampled from the trivianearme.net listing. Those were previously
sourced by scraping the trivia-company listing pages directly (Head in
the Clouds, Geeks Who Drink, Sporcle Events — see
`docs/source-candidates/headinthecloudstrivia.md`), which is the more
authoritative upstream anyway. trivianearme.net's own `addressLocality`
field is also unreliable (every venue is labeled `"Seattle"` regardless
of true city — several sampled venues are actually in Bellevue, Kirkland,
Kenmore, or Renton), and it has at least one internal duplicate entry
(two "Georgetown Liquor Company" listings with slightly different address
formatting). Implementing this as a new aggregator would mostly recreate
already-existing recurring entries. Not worth the scraping/dedup effort
for the residual few venues that might not yet be covered — those are
better caught by a future dedicated per-venue candidate the normal way.
