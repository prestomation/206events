---
name: "Visit Seattle (RSS)"
status: added
firstSeen: 2026-05-07
lastChecked: 2026-06-12
tags: [Community]
---
`https://visitseattle.org/events/feed/`. Working RSS 2.0 feed with
10 curated/featured events (Christmas Market, Bite of Seattle, Festál
series, etc.). The Tribe Events `?ical=1` parameter is silently ignored
(returns the HTML page, not ICS).

Implemented 2026-06-12 as a custom IRipper: fetches the RSS feed, then
fetches each event's page to parse the date/location from the
`<h4><span>DATE</span> | <span>LOCATION</span></h4>` element. Produces
10 events: all major future Seattle events curated by Visit Seattle.
