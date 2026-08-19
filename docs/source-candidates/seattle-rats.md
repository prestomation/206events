---
name: "Seattle RATS (Recreational Adult Team Soccer)"
status: investigating
platform: Custom Angular SPA (Firebase-backed), no plain API found
url: https://seattlerats.org/calendar/all-events/
tags: [Sports]
firstSeen: 2026-08-19
lastChecked: 2026-08-19
---

Nonprofit adult recreational soccer league; `/calendar/all-events/` lists
game schedules across multiple divisions at various Seattle-area fields.

Investigated 2026-08-19: the page is a heavily client-rendered Angular
Material app (`_nghost-ng-*` markers, `mat-*` CSS custom properties) backed
by Firebase (`firestore.googleapis.com`, `identitytoolkit.googleapis.com`
referenced in page scripts) rather than server-rendered HTML or a
documented public API. A plain `curl` fetch returns mostly framework CSS/JS
with no event data in the initial HTML. No `the-events-calendar`/Tribe,
Squarespace, or other built-in-type signature found.

Would need either browser automation (out of scope for a standard ripper)
or reverse-engineering an internal Firestore/REST call — not attempted this
cycle. Also, game schedules are logistics-heavy fixtures (division/field/
time tables) more than public "events" in the calendar sense, which may
make this a lower-value scrape even if a feed is found. Low priority;
revisit if a public API surfaces.
