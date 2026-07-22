---
name: "Shorty's (Seattle Pinball Bar)"
status: notviable
platform: Custom HTML
url: https://shortydog.com/calendar.html
tags: [Nightlife, Belltown]
firstSeen: 2026-07-22
lastChecked: 2026-07-22
---

Pinball arcade bar in Belltown (2316 2nd Ave), hosting weekly happy hours
and recurring pinball tournaments (First Sunday Pinball, Bi-Weekly Trifecta
of Power, Drain in Belltown, Clown Town Throw Down).

Checked the live `/calendar.html` page 2026-07-22: content is static HTML
with no JSON/API/ICS feed. The page mixes genuinely recurring tournament
listings with stale, undated content (a mask-wearing note left over from
the COVID era, an "Annual Pinball Tournament" line with no year, commented-
out HTML fragments still rendering). No reliable way to distinguish current
listings from years-old leftovers without manual verification against the
venue's Instagram/Facebook. Not viable as a scraped source in its current
state — no structured data and unclear freshness.
