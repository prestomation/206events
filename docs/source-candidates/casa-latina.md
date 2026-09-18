---
name: "Casa Latina"
status: notviable
platform: WordPress
url: https://casa-latina.org/events/
tags: [Community]
firstSeen: 2026-07-06
lastChecked: 2026-09-18
---

Seattle nonprofit (Beacon Hill / Central District area) supporting Latino and
immigrant communities through resources, education, and employment training;
maintains a public events page.

Investigated 2026-07-06: WordPress site (`wp-json` link header present), but
`https://casa-latina.org/events/` returns HTTP 403 directly from this
environment. Not stageable per the quality gate — blocked from every angle
tried here, nothing to prove yet. Re-check in a future cycle.

**Update 2026-09-18:** No longer 403s (200 from this environment). But the
page turns out to be a plain WordPress page-builder layout listing one-off
fundraisers/announcements as static blocks, not a real calendar — only
**one** upcoming item ("Casa Latina Night with the Sounders", Sep 23, 2026),
with most of the "Past Events" list being sporadic one-off fundraisers/
campaigns spanning 2023–2026. `wp-json/wp/v2/types` confirms no custom
"event" post type is registered/exposed via REST (`post` only) — no
structured feed to scrape. Too thin on event volume and no machine-readable
source; flipped to `notviable`.
