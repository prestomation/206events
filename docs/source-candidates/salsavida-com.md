---
name: Salsa Vida Seattle Social Dance Calendar
status: added
platform: Custom HTML (JSON-LD ItemList)
url: https://www.salsavida.com/guides/washington/seattle/
tags: ["Dance"]
firstSeen: 2026-08-25
lastChecked: 2026-09-15
pr: 1350
---

**Duplicate of `docs/source-candidates/salsa-vida-seattle.md`** — same
domain (salsavida.com), same Seattle guide page. That file is the
canonical record: implemented as `sources/salsa_vida_seattle` in PR #1350
(2026-09-02).

This file was originally created independently by a separate "aggregator
gap analysis" discovery pass that didn't cross-reference the existing
candidate. Re-checked 2026-09-15 while attempting to implement this
candidate a second time as `sources/salsavida` — caught as a near-exact
duplicate (same URL, same JSON-LD `ItemList` parsing approach, same
Seattle-locality filter, same 14 Seattle events) before merging; the
duplicate ripper was removed rather than landed. Keeping this file (rather
than deleting it) so future discovery passes that land on the
`badslava-com.md`/`salsavida-com.md` naming also see `status: added` and
stop here instead of re-discovering the same site a third time.
