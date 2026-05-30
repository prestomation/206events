---
name: "Furry 5K Fun Run & Walk"
status: added
platform: Recurring (annual)
url: https://furry5k.com/
tags: [Running, Dogs, Community, "Seward Park"]
firstSeen: 2026-05-29
lastChecked: 2026-05-29
---

Discovered from a community poster board photo — June 14 2026 at Seward
Park, register @ furry5k.com, benefiting the Seattle Animal Shelter
Foundation.

`furry5k.com` redirects to **RunSignup** race 125379. Confirmed via the
RunSignup REST API (`https://runsignup.com/rest/race/125379?format=json`,
2026-05-29): next_date 06/14/2026 11:30, 5900 Lake Washington Blvd S
(Seward Park). It is a **single annual event** (2024-06-09, 2025-06-08,
2026-06-14 — all the second Sunday of June), and RunSignup exposes no ICS
feed (`/Race/Ical/...` 404s).

Because the date is a stable rule (2nd Sunday of June), captured it as a
recurring entry rather than a one-off:
`sources/recurring/furry-5k.yaml` (`schedule: 2nd Sunday`, `months: [6]`).

The parent **Seattle Animal Shelter Foundation** events page
(`seattleanimalfoundation.org/events/`) hard-blocks automated fetches
(403/503) and appears to run only a handful of annual events — not worth
a dedicated source. See `seattle-animal-shelter-foundation.md`.
