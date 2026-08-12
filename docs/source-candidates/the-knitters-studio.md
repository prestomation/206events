---
name: "The Knitters Studio"
status: candidate
platform: Custom HTML (Squarespace static page, not an Events collection)
url: https://www.theknitterstudio.com/classes-and-events-1
tags: []
firstSeen: 2026-08-12
lastChecked: 2026-08-12
---

Knitting/crochet shop and studio. Weekly social knit/crochet sessions plus
periodically scheduled classes ("Learn to Knit: Saturdays Sept. 19, 26,
Oct. 3, 10; 5-6 pm", "Serial Dyehouse Pop Up: August 21, 22, 23").

Investigated 2026-08-12:
- Site is Squarespace (`images.squarespace-cdn.com` asset URLs)
- `?format=json` on the classes-and-events page returns `"type": 10`
  (plain page) with `itemCount: 0` — this is **not** a Squarespace Events
  collection, just prose text with embedded dates, so the built-in
  `squarespace` ripper type does not apply
- No ICS export found
- Would require a 🔴 low-confidence custom HTML scraper parsing
  free-text date mentions — fragile, low event volume
- Not yet confirmed to be primarily Seattle vs. broader service area;
  needs an address lookup before implementation
