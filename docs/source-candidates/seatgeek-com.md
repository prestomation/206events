---
name: SeatGeek (Seattle events)
status: notviable
platform: SeatGeek
url: https://seatgeek.com/
tags: ["watching-sports", "music"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
pr:
---

Discovered via aggregator gap analysis. 5 events in the Seattle
metro sample. Source domain: seatgeek.com.

Sample event: "Philadelphia Phillies at Seattle Mariners" (2026-08-25T01:40:00.000Z)
Description: MLB regular season game: Philadelphia Phillies at Seattle Mariners at T-Mobile Park. Native American Heritage Night.

**2026-09-23 (notviable):** SeatGeek is a national ticket resale aggregator. Its Platform API needs a registered `client_id` (private key), and it only republishes events that first-party sources already cover (e.g. Mariners at T-Mobile Park, Ticketmaster/AXS venues). It fails the national-aggregator quality gate.
