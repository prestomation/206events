---
name: "Dragonfly Yoga Pilates Dance"
status: added
platform: Momence (readonly-api.momence.com)
url: https://www.dragonflywestseattle.com/
tags: [Dance, Wellness, "West Seattle"]
firstSeen: 2026-09-17
lastChecked: 2026-09-17
pr:
---

West Seattle yoga/pilates/dance studio, 3270 California Ave SW, Seattle, WA
98116. Surfaced while investigating an "aggregator gap analysis" Momence
sample for a different (Redmond) studio — searched for other Seattle-proper
Momence-powered studios and found this one.

**Investigated 2026-09-17:**
- Site embeds a Momence booking widget (`momence.com/u/dragonfly-jz7h6Z`).
  Watching the network requests the widget makes (via Playwright) revealed
  a public, unauthenticated JSON API with permissive CORS:
  `https://readonly-api.momence.com/host-plugins/host/40118/host-schedule/sessions`
  — no API key or token required, same pattern likely reusable for any
  other Momence-hosted studio (swap the numeric `hostId`).
- At time of check: 5 upcoming one-off workshops/socials (`special-event-new`
  type — SoundBath, a personal-safety workshop, an energy-healing session,
  etc.) plus 1069 raw weekly class occurrences across only 12 distinct
  class names (`fitness` type), which collapse to 25 distinct
  (class name, weekday, local time) recurring series once deduplicated.
- Implemented as `sources/dragonfly_west_seattle` (custom `IRipper`):
  one-off sessions pass through as discrete events; recurring weekly
  classes are deduplicated and emitted as one event per series with a
  weekly `RRULE`, anchored on the earliest fetched occurrence (mirrors
  `lib/config/recurring.ts`'s approach for hand-authored recurring
  venues). Dedup keys on the *local* (Pacific) weekday/time — grouping by
  raw UTC time-of-day instead would incorrectly split a series across the
  November DST transition.
- `sourceRole: venue`, `geo` fixed at the studio address, tags `Dance`,
  `Wellness`, `West Seattle`. 30 events (25 recurring + 5 one-off), 0 parse
  errors, verified via `ONLY_SOURCE=dragonfly-west-seattle npm run
  generate-calendars`; full `npm run test` and `npx tsc --noEmit` clean.

Also checked, while investigating this candidate, whether the same
Momence widget pattern applied to Aria Ballroom (`ariaballroom-com.md`,
`hostId` 43120) — real API, but the venue is in **Redmond, WA**, outside
Seattle city limits, so not implemented. See that file.
