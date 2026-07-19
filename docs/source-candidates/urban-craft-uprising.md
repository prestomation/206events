---
name: "Urban Craft Uprising"
status: added
platform: Custom HTML (WordPress)
url: https://urbancraftuprising.com/events/
tags: [MakersMarket, Art]
firstSeen: 2026-07-13
lastChecked: 2026-07-19
pr: 921
---

Seattle's long-running (est. 2005) bi-annual indie craft show, ~150+
vendors per show. Historically at Magnuson Park Hangar 30 (Summer Show)
and Seattle Center Exhibition Hall (Winter Show); also lists smaller
markets like "Port Townsend Handmade Market", "Derby Days", "First Bite
Night", and "Gobble Up Seattle" on its events page.

**Correction 2026-07-19:** this candidate's `status: candidate` was stale
— `sources/urbancraftuprising/ripper.ts` (custom `HTMLRipper` subclass that
crawls `/events/` for detail-page links and parses each one) was already
implemented and merged in PR #921 (2026-07-11), one day *before* this
file's `firstSeen`/investigation note below was written. The 2026-07-13
investigation pass evidently didn't check for the no-hyphen directory
name (`sources/urbancraftuprising/`) and treated it as unimplemented.
Re-verified 2026-07-19 via `ONLY_SOURCE=urbancraftuprising npm run
generate-calendars`: **3 live events** (Gobble Up Seattle 2026, First
Bite Night 2026, UCU 22nd Anniversary Winter Show Preview Night), so the
existing pipeline is healthy. Flipping to `status: added` and closing out
this candidate file — no further action needed.

(Original 2026-07-13 investigation note, kept for history: found the site
running WordPress with no structured event API and figured a custom
HTML scraper of individual event pages would be required — correct, and
that's exactly what PR #921 built.)

**Side note for future maintenance:** while re-verifying, found that UCU's
individual event links on `/events/` (e.g. "First Bite Night 2026",
"Gobble Up Seattle 2026") actually resolve to **Eventbrite ticket pages**
— UCU sells tickets for its shows via Eventbrite organizer id
`8435126437` (verified, 46 historical events). The public Eventbrite
mirror currently lists 3 live events there matching what the existing
scraper also picks up. Not switching the ripper today since the custom
scraper already works and is proven in production — but if
`sources/urbancraftuprising/ripper.ts` ever breaks (e.g. a WordPress
theme/markup change), the built-in `eventbrite` ripper type against this
organizerId is a ready-made, lower-maintenance replacement.
