---
name: Comet Tavern
status: notviable
platform: Squarespace (static HTML, no event data)
url: https://thecomettavern.com/events
tags: [Music, Capitol Hill]
firstSeen: 2026-07-21
lastChecked: 2026-07-21
---

Historic Capitol Hill dive bar at 922 E Pike St, Seattle, WA 98122.
Squarespace site has empty events collection (itemCount: 0). The events page
only has static HTML descriptions of recurring weekly events (DJ nights,
sports watch parties) with no specific dates, artist names, or individual
event pages.

## Findings

- No ticketing platform (no Eventbrite organizer page, no booketing, no Dice)
- No individual event pages (only `/events` with static content)
- No JSON-LD event structured data
- Instagram (@comet_tavern) and Facebook (CometSeattle) exist but require
  JS rendering to scrape event posts
- Only specific event reference found: "DJ set on January 15th @ Comet Tavern"
  hardcoded in HTML — this is stale/past
- Recurring events described generically: "Resident DJs kick off at 10pm"
  with no date-specific information

## Conclusion

No viable data source for individual dated events. The venue appears to
operate on a walk-in basis with recurring weekly programming but doesn't
publish a dated event calendar online.