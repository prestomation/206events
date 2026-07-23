---
name: "Fremont Chamber of Commerce"
status: candidate
platform: GrowthZone
url: https://business.fremont.com/calendar
tags: [Community, Fremont]
firstSeen: 2026-07-23
lastChecked: 2026-07-23
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
