---
name: "West Seattle Chamber of Commerce"
status: added
platform: GrowthZone
url: https://westseattle.wschamber.com/events/details/men-s-therapy-group-08-25-2026-15022
tags: ["wellness", "cozy"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
pr: 1570
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: westseattle.wschamber.com.

Sample event: "West Seattle Counseling: Men's Therapy Group" (2026-08-26T01:00:00.000Z)
Description: Counseling West Seattle's Men's therapy group, hosted by Matthew Kirshman. Meets every Tuesday from 6:00–7:15 p.m. in person at Counseling West Seattle's offices on California Avenue.

Added 2026-09-23 as custom ripper `sources/west_seattle_chamber/` (source name `west-seattle-chamber`, aggregator, tags Community + West Seattle). GrowthZone/ChamberMaster site: the ripper crawls `/events/calendar/YYYY-MM-01` for the current + next 2 months, then parses each `/events/details/<slug>` page's schema.org microdata (UTC startDate/endDate, Place name + PostalAddress, description, event image). Listings with no published location fall back to "West Seattle, Seattle, WA" plus a location UncertaintyError; Fourth Emerald Games' weekly series (most of the no-location listings) is mapped to its chamber-directory address. `ONLY_SOURCE=west-seattle-chamber`: 70 events, 4 location uncertainties, 0 parse errors. Per-event ICS (`/events/ical/<slug>.ics`) exists but its LOCATION field is usually blank, so the detail page is used instead.
