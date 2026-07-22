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

**Reconciliation note:** `docs/discovery-log/2026-06-25.md` previously
recorded "Shorty's Pinball (Belltown): Domain dead (ENOTFOUND); closed
permanently." That finding was based on a guessed domain that doesn't
resolve (e.g. `shortyspinball.com`), not the venue's actual domain
`shortydog.com`, which resolves fine (`curl` confirms 200 on both the
root and `/calendar.html`) and shows no sign of being down. The venue was
never actually closed — the June finding was a domain-guessing error, not
a real closure. Recorded here as `notviable` (not `dead`) for that reason.
