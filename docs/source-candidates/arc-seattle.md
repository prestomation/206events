---
name: ARC Seattle Events
status: added
pr: 1412
platform: WordPress (Custom HTML)
url: https://arcseattle.org/events
tags: [Community, Kids]
firstSeen: 2026-08-14
lastChecked: 2026-09-08
---

Advocacy and Resources for Citizens with developmental disabilities Seattle chapter events.

**Checked 2026-08-14:** Confirmed live — this is the Associated
Recreation Council (ARC), a secular nonprofit partnering with Seattle
Parks & Recreation on inclusive/family recreation programming, not a
religious org. WordPress site (`/wp-content/` paths). Real events with
dates found: Power of Play (Mar 5), Seattle Street Sports Showdown
(Aug 8-9), Big Day of Play (Aug 15), Teen Summer Musical (Aug 28-30),
Street Hockey Clinics (Oct 17 & 24), Pathway of Lights (Dec 12) — ~6
events spread across the year, low-but-steady volume. No ICS found; HTML
scrape needed.

**Implemented 2026-09-08:** Added as `sources/arc_seattle/` (PR #1412).
Custom HTML ripper parses the `/events/` listing page for dated cards,
then each event's own detail page — multi-session events (Street Hockey
Clinics) split into one event per date/time/location session; single-date
events (Pathway of Lights, Big Day of Play) use the listing card's date
with the guessed start time/duration flagged via `UncertaintyError` since
neither page publishes one. Cards with only vague placeholder text
("Annually in August", "Spring 2026") are skipped. Verified live: 5
events, 0 parse errors, all geocoded.
