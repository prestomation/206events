---
name: "CID Night Market"
status: investigating
platform: Custom
url: https://www.seattlechinatownid.com/experiences/c-id-night-market
tags: [Community, "Chinatown-International District"]
firstSeen: 2026-07-31
lastChecked: 2026-07-31
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
