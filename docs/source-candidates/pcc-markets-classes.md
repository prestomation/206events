---
name: PCC Markets Classes and Events
status: notviable
platform: WordPress + WooCommerce
url: https://www.pccmarkets.com/classes-and-events
tags: [Learning, Food]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr:
---

PCC Community Markets cooking classes, nutrition workshops, and community events at various locations.

**Findings (2026-08-14):** Live, actively-maintained WordPress + WooCommerce site
(`dateModified` 2026-07-30). The landing page links to a real "Class Calendar" at
`https://www.pccmarkets.com/class/calendar/?lo_all=1`, which loads (200) but the actual
class listing content appears to be rendered client-side (no class titles, dates, or
schema.org Event/Product markup found in the static HTML for either page) — cooking classes
look like WooCommerce products sold per-session across multiple store locations. A WP REST
endpoint exists (`wp-json/wp/v2/...`) but no obvious `wp-json` route for the class catalog
was found in the fetched HTML. Needs either browser-rendered fetch or discovery of the AJAX
endpoint powering the calendar grid before this can be scraped. PCC is a real, large Seattle
co-op with many locations — worth the extra digging.

**Closed 2026-09-23:** Dead. `/class/calendar/?lo_all=1` now redirects to `/classes/`, which says PCC has sunset its culinary education program (adult and kids classes and camps); the program officially concluded on August 28, 2026. No class calendar remains to scrape.
