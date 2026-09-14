---
name: "Lower Queen Anne Events (fosdal.net)"
status: notviable
platform: custom Hugo site with open-CORS JSON/ICS export
url: https://fosdal.net/lqa-events/
firstSeen: 2026-09-14
lastChecked: 2026-09-14
---

A personal side project (by Steve Fosdal) aggregating events for Seattle
Center / Lower Queen Anne area venues, with an explicitly open-CORS
`events.json` / `events.ics` export — technically the easiest kind of feed
to consume.

Investigated 2026-09-14:
- `https://fosdal.net/lqa-events/events.json` returns 1156 event entries
  covering Seattle Center, Climate Pledge Arena, McCaw Hall, Convention
  Center, Seattle Children's Theatre, SIFF Cinema Uptown, The Vera Project,
  MoPOP, On the Boards, Lumen Field, KEXP, T-Mobile Park, Pacific Science
  Center, and Cornish Playhouse.
- Every one of those venues/orgs already has its own dedicated ripper in
  this repo (`mopop`, `vera_project`, `pac_sci`, `seattle_childrens_theatre`,
  `seattle_center`, `kexp` calendar, etc.) or is covered via `seattle_center`
  sub-calendars — adding this aggregator would be near-total duplicate
  content, relying on cross-source dedup to clean up rather than adding new
  coverage.
- Data quality is questionable: the feed contains heavy exact-duplicate
  rows (1156 total vs. 1135 unique `(venue, title, date)` tuples — some
  events repeated 4x) and at least one clear venue misattribution (Seattle
  Seawolves rugby matches, actually played at **Starfire Stadium in
  Tukwila** — outside Seattle — are also listed under "Seattle Center").
- Given the near-total overlap with sources this repo already maintains
  first-party, plus the duplication/misattribution issues, not worth
  adding — per "Prefer venue websites over showlists" (AGENTS.md), the
  dedicated venue rippers already covering this content are the better
  source of truth.
