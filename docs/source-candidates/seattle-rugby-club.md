---
name: "Seattle Rugby Club"
status: investigating
platform: Webflow
url: https://www.seattle.rugby/schedule
tags: [Sports]
firstSeen: 2026-08-16
lastChecked: 2026-08-16
---

Seattle Rugby Club (men's + women's, founded 1966/1971), historically
home matches at Magnuson Park. Site runs on Webflow
(`cdn.prod.website-files.com` asset URLs) with a `/schedule` page
listing home/away fixtures.

Not yet confirmed viable: the schedule mixes home matches (Seattle,
Magnuson Park) with away fixtures at other PNW clubs' grounds (e.g.
deWilde Rugby & Polo Fields in Ferndale, ~90mi north), and no
ICS/JSON feed was found on a quick pass — would need either a
Webflow CMS API check or custom HTML scraping filtered to home-only
fixtures. Low priority (niche sport, uncertain volume of home games
per season) — parking as `investigating` rather than doing a deeper
platform check this cycle.
