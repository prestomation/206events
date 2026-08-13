---
name: "Theodor Jacobsen Observatory"
status: added
platform: Eventbrite
url: https://astro.washington.edu/jacobsen-observatory
tags: [Education, "University District"]
firstSeen: 2026-08-13
lastChecked: 2026-08-13
pr:
---

UW's historic 1895 on-campus observatory (4324 Memorial Way NE). UW
Astronomy Outreach runs recurring public open-house evenings (public
talk + telescope viewing) roughly twice a month.

Investigated 2026-08-13:

- The observatory's own page (`astro.washington.edu/jacobsen-observatory`)
  lists upcoming open-house dates in a table but has no calendar
  widget/RSS/ICS — booking is per-date through individual Eventbrite
  event pages ("there is a different page for each open house date").
- Each per-date Eventbrite event page is organized by **UW Astronomy
  Outreach**, organizer ID `8618644131`
  (`https://www.eventbrite.com/o/8618644131`) — confirmed from a live
  event page ("Theodor Jacobsen Observatory Open House – September 15th
  at 8 PM").
- Search results surfaced at least 6 distinct dated open-house events
  (May 19, June 2, July 7, Aug 18, Sept 1, Sept 15, 2026), all at the
  same fixed observatory address — matches the built-in `eventbrite`
  ripper type (`organizerId` config) with `geo` set at the venue level.
- The related UW Planetarium (`astro.washington.edu/uw-planetarium`)
  books shows through Calendly/Linktree, not Eventbrite — its events did
  not appear under this organizer and are out of scope for this source.
- `EVENTBRITE_TOKEN` is already wired into `build-calendars.yml` (used
  by other `eventbrite`-type sources) — no new secret needed.
- Could not verify a live event count from this environment
  (`EVENTBRITE_TOKEN` is a CI-only secret) — confirming via the PR's CI
  build log per the standard "check event count in CI" step.

Implemented as `sources/jacobsen_observatory/` (built-in `eventbrite`
type, no custom ripper code).
