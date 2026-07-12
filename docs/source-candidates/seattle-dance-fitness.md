---
name: "Seattle Dance Fitness (SDF)"
status: notviable
platform: Custom HTML (Wix Events widget)
url: https://www.seattledancefitness.com/events
tags: [Dance, Fitness]
firstSeen: 2026-07-11
lastChecked: 2026-07-12
pr:
---

Dance fitness studio ("SDF Studio") hosting themed pop-up dance fitness
celebrations (e.g. "THUNDERSTRUCK!", "Broadway to Seattle", pride-themed
events). Ticketing via Punchpass (external, not usable as a feed itself).

Investigated 2026-07-11:
- Site is built on **Wix**. The `/events` page embeds one Wix Events
  widget per event (`data-hook="EVENTS_ROOT_NODE"`), server-rendered into
  the initial HTML — a plain `curl` fetch (no JS execution) returns the
  title, date, and location for each.
- 3 widget blocks found on the page (`data-hook="event-title"` /
  `"short-date"` / `"short-location"` / `"ev-description"`), consistent
  markup across all three:
  - "EXPRESS YOURSELF! A PRIDE Dance Fitness Celebration!" — Jun 26, 2026 (past by check date)
  - "Broadway to Seattle!" — Jul 24, 2026, 4:30 PM
  - "💥 THUNDERSTRUCK! 💥" — Aug 08, 2026, 2:00 PM
- No ICS feed, no Squarespace/Eventbrite/DICE equivalent — would need a
  **custom HTML scraper** targeting the `data-hook` attributes above.
  Each event appears to be manually embedded as its own widget rather
  than a single paginated list, so the scraper needs to iterate over all
  `EVENTS_ROOT_NODE` blocks on the page rather than assuming a fixed
  count.
- Low event volume (2 upcoming at time of check) but consistent, parseable
  structure. 🔴 Low-confidence tier (custom scraper) — good candidate for
  a future implementation cycle.

Re-checked 2026-07-12 while implementing: confirmed 2 live upcoming
occurrences (Broadway to Seattle — Jul 24, THUNDERSTRUCK! — Aug 8), so the
scraper design above holds. However, the studio's physical address (from
`/studio`, embedded in the page's `businessLocation*` JSON and a Google
Maps link) is **1501 N 200th St, Warehouse A, Shoreline, WA 98133** — the
"SDF Studio" that both events take place at is in **Shoreline**, not
Seattle proper. Per the source-discovery quality gate ("Venues entirely
outside Seattle... are not appropriate"), this disqualifies the source
despite the "Seattle" branding in its name. Not implementing.
