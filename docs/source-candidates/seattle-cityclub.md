---
name: "Seattle CityClub"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/seattle-cityclub-12026318033
tags: [Community]
firstSeen: 2026-07-11
lastChecked: 2026-08-24
pr: 1275
---

Nonpartisan 501(c)(3) nonprofit focused on the civic health of the Puget
Sound region (candidate forums, civic discussions).

Investigated 2026-07-11:
- Confirmed Eventbrite organizer (id `12026318033`).
- 0 upcoming events at time of check (`upcomingEvents` empty in the
  page's embedded `__NEXT_DATA__`). Per the "200 + 0 events" rule, do not
  implement yet — re-check next cycle.

Re-checked 2026-07-22: still 0 upcoming events (Squarespace `?format=json` upcoming array empty, or Eventbrite organizer `upcomingEvents` empty). No change.

Re-checked 2026-08-24: `__NEXT_DATA__` now shows 1 upcoming event —
"Voter Guide Live with Seattle CityClub & KUOW" (Sep 16, 2026, The
Collective Seattle, 400 Dexter Avenue North #120, Seattle, WA 98109).
Clears the "200 + events found" gate. Implemented as
`sources/seattle_cityclub/ripper.yaml` using the built-in `eventbrite`
type (`geo: null`, `sourceRole: venue` — rotating-venue civic org, same
pattern as `seattle-social-club`/`seattle-downtown-community-council`;
`expectEmpty: true` given the low, intermittent civic-forum cadence, same
as `sync-seattle`). `EVENTBRITE_TOKEN` is already an existing repo
secret, so no new credential wiring needed. Local
`ONLY_SOURCE=seattle-cityclub npm run generate-calendars` confirms the
config loads and parses cleanly (0 events locally since the token isn't
available in this environment — expected; CI has the secret).

CI confirmed 2026-08-24: PR preview build shows 1 event for
`seattle-cityclub` ("Voter Guide Live with Seattle CityClub & KUOW"),
all checks green. PR #1275.
