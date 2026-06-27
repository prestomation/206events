---
name: Hot Stove Society
status: added
platform: Custom HTML (BentoBox + schema.org Event LD+JSON)
url: https://www.hotstovesociety.com/store/events/
tags: [Food, Belltown]
firstSeen: 2026-06-27
lastChecked: 2026-06-27
pr: 0
---

Tom Douglas's culinary school at Hotel Andra (2000 4th Ave, Seattle). Offers cooking classes, radio show tapings, junior chef camps, and themed dinner events.

**Platform**: BentoBox (`getbento.com`). No ICS feed or public JSON API. Events are rendered in HTML and each event page includes a `application/ld+json` block with `@type: "Event"` containing full startDate, endDate, location, and image.

**Timezone quirk**: BentoBox stores local Pacific time with a `Z` suffix (treating it as UTC). The ripper strips the `Z` and applies `America/Los_Angeles` explicitly.

**Implementation**: Custom `IRipper` — fetches listing page to extract event URLs, then fetches each event detail page and parses the LD+JSON. 10 events at time of implementation.
