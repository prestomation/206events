---
name: Yerbana
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/yerbana-46758311953
tags: [Community, Parks, Wallingford]
firstSeen: 2026-05-18
lastChecked: 2026-05-18
pr:
---

Surfaced via a poster lookup (source-from-event skill): "Yerbana — Yoga
in the Park, Season 6 • 2026 • 18 events". Yerbana is a Seattle social
enterprise running a weekly summer yoga/wellness gathering at Gas Works
Park (Thursdays, May 21 – Sep 17, 2026) plus additional sessions at
Woodland Park ("Flow in the Forest"), Sunday sound baths, and a
"Seattle Wellness Block Party" series.

Built-in `eventbrite` ripper type — organizer ID `46758311953` confirmed
from the JSON-LD on a public event page. The Eventbrite organizer page
shows multiple upcoming 2026 events:

- 2026-06-13 — Seattle Wellness Block Party Series
- 2026-06-14 — Sunday Sound Bath: Rest•Reset•Reconnect
- 2026-07-19 — Sunday Sound Bath: Rest•Reset•Reconnect
- (plus the 18-week Yoga in the Park series, Thursdays through summer)

Multi-venue promoter (Gas Works Park + Woodland Park + others), so
ripper-level `geo: null`. Tagged with the primary Gas Works Park
neighborhood (`Wallingford`) plus `Community` and `Parks` to mirror how
`waterfront-park` tags its yoga sessions.
