---
name: City of Auburn
status: investigating
platform: Liferay portal (community calendar)
url: https://www.auburnwa.gov/city_hall/community_calendar
tags: [Community, Auburn]
firstSeen: 2026-09-24
lastChecked: 2026-09-24
pr:
---

City of Auburn community calendar. Site is reachable (HTTP 200), but
it runs on a Liferay portal, not the CivicPlus platform used by
Redmond/Bellevue/Bothell/Mercer Island. The page's "Subscribe to iCal
and RSS Feeds" control is a JS `onclick` that navigates to a portal
action URL
(`/city_hall/community_calendar/?portalId=...&action.224843=subscribeToICalAndRssFeeds&...`)
rather than exposing a direct `.ics` link — that URL renders an HTML
instructions page, not a feed, in a plain fetch. Would need either
following that action through to whatever feed URL it actually
generates, or a small custom scraper against the portal's calendar
widget. Left as `investigating` rather than implementing blind.
