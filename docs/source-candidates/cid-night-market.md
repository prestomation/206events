---
name: "CID Night Market"
status: added
platform: Custom (recurring YAML)
url: https://www.seattlechinatownid.com/experiences/c-id-night-market
tags: [Community, "International District"]
firstSeen: 2026-07-31
lastChecked: 2026-08-03
pr: pending
---

**CID Night Market** — organized by the Seattle Chinatown-International
District Preservation and Development Authority (SCIDpda) /
seattlechinatownid.com. Free, all-ages street festival with vendors, food
trucks, and cultural performances under the Chinatown Gate.

Investigated 2026-07-31:
- Confirmed 2026 date on the page: Saturday, September 26, 2026, 1-9pm
- `/experiences` overview page mentions only two named recurring events for
  the org: CID Night Market and a Lunar New Year Night Market — roughly
  2 events/year total, both single-day annual festivals
- No CMS fingerprint detected (not Squarespace/WordPress/Wix in page
  source) — appears to be a custom-built site; no ICS/API/JSON feed found
  via straightforward probing
- Would require a custom `HTMLRipper` (or a hand-coded `sources/recurring/`
  entry) for very low volume (~2 dated events/year)

Low priority given the volume, but per the "low-volume sources are valid"
rule this is still viable if picked up. Re-check for a structured feed or
confirm exact annual dates before implementing (e.g. as a recurring YAML
similar to `free-first-thursday`, one entry per named annual event once a
few years of dates establish the pattern, or a single dated event refreshed
manually each year).

Implemented 2026-08-03:
- Confirmed the CID Night Market page (`/experiences/c-id-night-market`) is
  a standalone "Experiences" landing page distinct from the site's
  `/local-events` calendar listing already covered by the existing `cidbia`
  ripper — checked the September 2026 `/local-events` month page directly
  and it does **not** include the Night Market (only the monthly CID
  Community Clean-Up), so this is a genuine gap, not a duplicate.
- Confirmed date pattern across 3 years: 2024 = Sep 21 (3rd Saturday), 2025
  = Sep 27 (4th Saturday), 2026 = Sep 26 (4th Saturday, confirmed live on
  the page: "Saturday, September 26, 2026 1:00 PM - 9:00 PM"). Encoded as
  "4th Saturday" in September (same drift-tolerance precedent as
  `bite-of-seattle`, which also documents an off-pattern year).
- Added `sources/recurring/cid-night-market.yaml` — `sourceRole: venue`,
  `geo` from the existing `KNOWN_VENUE_COORDS`/geocoder entry for
  "hing hay park", `imageUrl` from a Wikimedia Commons photo (public
  domain/CC, via the Wikipedia article's infobox image).
- Verified via `ONLY_SOURCE=cid-night-market npm run generate-calendars`:
  1 event, 0 errors, `DTSTART` resolves to 2026-09-26T13:00 America/Los_Angeles.
