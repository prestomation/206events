---
name: "The Residency"
status: added
platform: Squarespace
url: https://www.theresidencyseattle.org/upcoming-events
tags: [Music, Arts, Community]
firstSeen: 2026-08-03
lastChecked: 2026-08-12
pr: 1186
---

Seattle youth hip-hop nonprofit (theresidencyseattle.org) running an
all-ages performing-arts program for teens. Hosts a handful of public
events per year across Pioneer Square and other Seattle venues — e.g.
"Second Sunday Jam" (Black and Tan Hall), an annual fundraiser at the
Showbox, and a Spring Showcase at Baba Yaga.

Investigated 2026-08-03:
- `?format=json` on `/upcoming-events` confirms Squarespace, collection
  type `events-stacked`.
- `upcoming: []` at time of check — the 4 items in the collection
  (Second Sunday Jam, "Music's in our blood," An Evening with the
  Residency, Spring Showcase) are all dated Sept 2025–Mar 2026 and have
  already passed relative to today.
- Secular youth arts nonprofit, not religious. Multi-venue (`geo: null`
  if implemented).

Per the quality gate, 0 upcoming events at check time means do not
implement yet — re-check next cycle since the org clearly runs a live
annual cadence of public shows.

**Implemented 2026-08-12 (PR #1186):** re-checked `?format=json` on
`/upcoming-events` — 1 confirmed future event ("We dream of hip-hop",
Aug 15, 2026, Nippon Kan Theatre, Pioneer Square). Added as a built-in
`squarespace` ripper source (`sources/the_residency_seattle/ripper.yaml`),
`geo: null` / `sourceRole: venue` (multi-venue, first-party org events),
tags `["Music", "Arts", "Community"]`, `expectEmpty: true` (intermittent
programming — a handful of shows per year, per the analogous
`downtown_seattle_association`/`futurewise`/`sync_seattle` pattern; the
build shouldn't flag a false zero-event warning between shows). Verified
locally with `ONLY_SOURCE=the-residency-seattle npm run
generate-calendars`: 1 event, 0 errors.
