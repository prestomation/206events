---
name: "Fremont Chamber of Commerce"
status: added
platform: GrowthZone
url: https://business.fremont.com/calendar
tags: [Community, Fremont]
firstSeen: 2026-07-23
lastChecked: 2026-08-04
pr: 1099
---

Fremont neighborhood business association calendar — found while
searching "Fremont Wallingford neighborhood events calendar Seattle."
(`fremont.com/our-events` and `fremont.com/events` both 404 — the live
events page is `business.fremont.com/calendar`, reached via a link from
the `fremont.com` homepage footer.)

Investigated 2026-07-23:
- Platform is **GrowthZone** (chamber-of-commerce association-management
  software), per the site's own "Site by GrowthZone" footer credit.
- Confirmed dated upcoming events at time of check: "5th of July Cleanup"
  (Jul 5, 2026), "Fremont Health & Wellness Meet Up" (Jul 22, 2026),
  "Fremont on the Rocks" craft cocktail walk (Jul 30, 2026), "APDA NW
  Optimism Walk" (Sep 19, 2026) — a mix of genuine community events and
  chamber business-networking activity.
- No ICS/RSS export found on the calendar page (view options are
  Grid/List/Calendar only, no subscribe/export link).
- Low event volume and a blend of public-facing vs. member-only chamber
  content; would require a custom HTML scraper (🔴 Low tier — GrowthZone
  is not one of the built-in ripper types) and filtering out
  internal-chamber-only items in the parse step, not the caller-side
  quality gate that separate concern.
- Not already covered — no existing GrowthZone ripper, and
  `sources/`/`sources/external/` has no Fremont Chamber entry (distinct
  from `sources/recurring/fremont-evening-market.yaml` and the Fremont
  Sunday Market, which are separate Fremont Chamber-adjacent events
  already tracked elsewhere).

Lower priority than built-in-type candidates given the custom-scrape
requirement and mixed public/chamber content — keep as `candidate` for a
future cycle rather than implementing immediately.

Implemented 2026-08-04 (PR #1099): custom `IRipper` at
`sources/fremont_chamber_of_commerce/`. Discovers event slugs from the
listing page's `schema.org/Event` cards, then fetches each event's
per-event GrowthZone ICS export (`/calendar/ICal/<slug>.ics`) for
authoritative date/time/location — sidesteps the earlier "no ICS/RSS
export" finding, which only checked for a bulk calendar-wide feed (none
exists) and missed the per-event ICS download link surfaced by the
"Add to Calendar" button on each event's detail page. `sourceRole:
aggregator`, `geo: null`, `weatherSetting: "mixed"`. Events with a blank
ICS `LOCATION` (e.g. an outdoor walk) get a neighborhood-level
placeholder plus an `UncertaintyError`, so the mixed public/chamber
content concern didn't need parse-time filtering — all 3 confirmed
upcoming events at implementation time were genuinely public (a health &
wellness networking meetup, twice, and a fundraiser walk), not
internal-chamber-only. Verified: 3 events, 0 parse errors, 1
non-fatal Uncertainty.
