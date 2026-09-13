---
name: Lambert House Events
status: added
platform: Custom HTML
url: https://www.lamberthouse.org/events-calendar
tags: [Queer, Youth, Community]
firstSeen: 2026-08-14
lastChecked: 2026-09-13
pr:
---

Lambert House LGBTQ+ youth community center in Capitol Hill hosting support and social events.

**Findings (2026-08-14):** Live page, renders a monthly calendar view (August 2026 checked)
plus a downloadable monthly PDF ("August 2026 Calendar"). No ICS/iCal export or JSON feed
found — would need HTML scraping. Not a religious org (temporarily meeting at a St. Mark's
facility during a relocation, but the org itself is a secular LGBTQ+ youth center). Volume is
low and mixed: some entries are facility closures/announcements rather than events, but real
events do appear (e.g. "D&D Ask-a-Wizard workshop", "Reopening celebration", Trans Group
meetings). Viable as a low-volume HTML scrape.

**Implemented (2026-09-13):** The monthly calendar image/PDF isn't machine-parsable,
but the "Ongoing programs" section of the events page is stable, plain-text weekly
group schedule (not the changing monthly highlights) — a good fit for
`sources/recurring/` instead of an HTML scraper. Added three recurring events for
the venue's weekly in-person youth groups at the Capitol Hill Drop-In Center (1818
15th Ave): Trans Group (Mondays 7-8:30pm), Karaoke (Tuesdays 7-8pm), and Art Group
(Wednesdays 7-8pm). Left out the "10-14 Year Old Group" (unconfirmed fee/registration
details) and the King County library branch groups (all outside Seattle city limits).
