---
name: Reclaim Clay Classes
status: candidate
platform: Squarespace
url: https://www.reclaimclay.com/classes-and-workshops
tags: [Creation]
firstSeen: 2026-08-14
lastChecked: 2026-08-16
---

Seattle clay studio offering pottery classes and workshops for various skill levels.

**Vetting notes (2026-08-14):** Real, active pottery studio at 800 S Weller St
#201, Seattle (International District). Site confirmed running on Squarespace
(`squarespace-cdn.com` asset paths). This overview page lists class types
("Intro To Wheel: 6 Week", "Clay Play: Thrown Bowls", etc.) but not specific
dates — dates live on individual class detail pages. Worth checking the
Squarespace `?format=json` endpoint on the events/class collection page
directly for a structured feed before writing a custom scraper. Not yet
covered by any existing source.

**Checked 2026-08-16:** `classes-and-workshops?format=json` is a real
Squarespace payload, but the collection is a **product/store listing**, not
an events collection — items have `publishOn`/`updatedOn` timestamps but no
`startDate` field. The class dates ("Wednesdays, Aug 26 - Sep 23, 6:00 PM -
8:30 PM") live only as unstructured text inside each product's `excerpt`
field. Doesn't match the standard built-in `squarespace` ripper type (which
needs `startDate` in `upcoming`/`past`/`items`); would need a custom scraper
parsing the excerpt text. Remains 🔴 Low-confidence/candidate — still worth
implementing eventually, just not a pick for a cycle favoring verified
built-in types.
