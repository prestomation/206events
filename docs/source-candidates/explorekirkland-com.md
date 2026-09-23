---
name: Kirkland Wednesday Market
status: investigating
platform: Unknown
url: https://www.explorekirkland.com/events/kirkland-wednesday-market/
tags: ["markets", "food", "family", "music"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 2 events in the Seattle
metro sample. Source domain: explorekirkland.com.

Sample event: "Kirkland Wednesday Market" (2026-08-26T22:00:00.000Z)
Description: Sample local and artisanal goods and specialties from fresh produce, to handmade arts and crafts, and delectable baked goods and more! Weekly market at Marina Park.

Checked 2026-09-23 (notviable): Outside Seattle: Kirkland Wednesday Market (Marina Park) and the Explore Kirkland tourism calendar cover Kirkland only.

**Re-evaluated 2026-09-23 (King County rule):** Kirkland is in King County, so geography is no longer the blocker. The site is a Tempest (Madden) CMS build. Its events listing is rendered client-side from Algolia (index `prod-explore-kirkland-listings`, `algoliaEvents` bundle). No ICS, no server-rendered event cards on `/events/` or its category pages, and no Tribe/REST feed. It is viable only through the Algolia search API, which needs the site's search-only key, and repo rules forbid hardcoding keys. Needs secret `EXPLOREKIRKLAND_ALGOLIA_API_KEY` (plus the app id, which is public) wired into the build before a ripper can be written. Note that `kirklandwa-gov` (City of Kirkland) is a separate candidate.
