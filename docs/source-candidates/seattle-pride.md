---
name: "Seattle Pride"
status: added
platform: Custom HTML
url: https://seattlepride.org/events
tags: [Community]
firstSeen: 2026-05-22
lastChecked: 2026-05-24
pr: 1
---

Seattle Pride community event calendar for the LGBTQ+ community in Seattle and the
broader Pacific Northwest. Aggregates Pride Month events including the annual Seattle
Pride Parade (June 28, 2026), Pride in the Park, community events, and more.

Implemented 2026-05-24:
- Custom HTML ripper parsing `.wrap_card` divs from the events listing page
- Fetches individual event detail pages for venue/address
- 35 events scraped (May–August 2026), primarily Seattle-area LGBTQ+ events
- Source: `sources/seattle_pride/`
