---
name: "Velocity Dance Center"
status: notviable
platform: WordPress / Salesforce ticketing
url: https://velocitydancecenter.org/events/
tags: [Dance, Arts]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Seattle's premier contemporary dance venue and presenter, at 1621 12th Ave (Capitol Hill). Hosts 8–10 professional performances per season plus community programs, education initiatives, and the OUT THERE experimental dance festival.

Investigated 2026-06-21:
- WordPress site confirmed (`/wp-content/uploads/` paths)
- Ticketing via **Salesforce** (`velocitydancecenter.my.salesforce-sites.com`) — not Eventbrite or Ticketmaster
- No ICS export or calendar subscription found
- Tribe Events ICS URL (`?post_type=tribe_events&ical=1`) returns HTTP 404
- 2026 season listing available on website but no machine-readable event data
- Salesforce Events API requires authentication; no public endpoint found

**Verdict**: Not viable — no machine-readable calendar format. Salesforce ticketing integration makes standard ripper approaches infeasible. Would require custom HTML scraper with uncertain reliability. Low priority.
