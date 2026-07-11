---
name: "Rainier Beach Community Club"
status: added
platform: WordPress (custom HTML scraper)
url: https://rainierbeachcommunityclub.org/events/
tags: [Community, "Rainier Beach"]
firstSeen: 2026-06-11
lastChecked: 2026-07-11
pr:
---
**Rainier Beach Community Club** — `https://rainierbeachcommunityclub.org/events/` — Community club at 6038 S Pilgrim St, Seattle, WA 98118 hosting neighborhood events including Jazz Jams, garden strolls, wine tastings, beach talks, and arts/crafts markets.

Investigated 2026-06-11:
- WordPress site (Museo Lite theme)
- No ICS/iCal export found; no Tribe Events
- Events listed as HTML content with confirmed 2026 dates (Jazz Jam, Garden Stroll, Ice Cream Social, Wine Tasting, Arts & Crafts Market, etc.)
- Low-medium volume (~8-10 annual events)
- Originally left as `notviable` since it would require a custom scraper.

Implemented 2026-07-11 (custom HTML ripper, `sources/rainier_beach_community_club/`):
- No higher-confidence candidates remained this cycle, and AGENTS.md is explicit that a custom scraper is not "not viable" — implemented one per the frye_art_museum/rainier_arts_center pattern.
- The single static `/events/` page lists every event as an `<h2>` (linking to its own detail page) followed by an `<h4>` date/time line and description, up to the next `<h2>` — parsed with `node-html-parser`, no API or ICS feed available.
- The page lists 13 events total. 6 currently have a concrete, parseable, future date (Ice Cream Social and Jazz Jam, Meaningful Movies, Wine Tasting, Plant & Seed Share, Harvest Social, Arts and Crafts Market) and are published. 2 have a concrete date that has already passed (Garden Stroll, Beach Talks) and are silently excluded, same as any past event. The remaining 5 are either the general recurring "Jazz Jam" blurb (no specific instance) or explicitly TBD/TBA (One Seattle Day of Service, Game Night, Homespun Tales Story Hour, Neighborhood Garage Sale) — these are permanent placeholder fixtures of the page rather than a parse failure, so they're skipped silently too instead of surfacing as `ParseError`s (a brand-new source's build fails CI on any `ParseError` regardless of event count).
- Several events omit a year or an end time in their prose; year is inferred (roll forward if >7 days past), and missing start/end times are flagged via the standard `UncertaintyError` mechanism rather than guessed silently.
- Confirmed via `ONLY_SOURCE=rainier-beach-community-club npm run generate-calendars`: 6 real events produced, 0 unexpected parse errors.
- Tag corrected from `Seward Park` (this candidate file's original guess) to `Rainier Beach` — the venue's actual neighborhood, already used elsewhere (`spl`, `tilth-alliance`).
- geo confirmed via Nominatim: 47.5153384, -122.2573183 (OSM way 237151003).
