---
name: Lid I-5
status: added
platform: Custom HTML
url: https://lidi5.org/tours/
tags: [Community, Activism, Parks, Downtown]
firstSeen: 2026-05-30
lastChecked: 2026-05-30
pr:
---

Grassroots campaign to build a lid park over Interstate 5 through downtown
Seattle. The WordPress.com site has no calendar plugin or ICS feed; the
`/tours/` page lists each volunteer-led walking tour of the Downtown lid
study area as an anchor linking to a Seattle Parks Foundation
(Classy) registration page, with the date/time in the link text
(e.g. "Tuesday, June 23, 2026, 5:30 PM – 7:00").

Implemented as a custom ripper (`sources/lid_i5/`) that fetches the tours
page once, extracts the `give.seattleparksfoundation.org/event/` anchors,
and parses date/time/duration from the link text. Stable event id derived
from the upstream registration id at the end of each URL (e.g. `e800432`).
All tours meet at the same fixed point (Optum parking lot, 703 Marion St),
so the source is a venue with a fixed `geo`.

Confirmed live: 3 upcoming tours (June 23, July 23, Aug 19 2026), 0 errors.
