---
name: "Vashon Center for the Arts"
status: added
platform: Spektrix API
url: https://vashoncenterforthearts.org/events/
tags: [Theatre, Music, Arts, Vashon]
firstSeen: 2026-05-29
lastChecked: 2026-05-29
---

Discovered from a community poster board photo — "Brett Dennen: Art is
Life" (Wed June 10 2026, Katherine L. White Hall) was not covered.

Ticketing runs on **Spektrix** (client `vashoncenter`). No ICS/Tribe
feed exists, but the public Spektrix v3 REST API returns clean JSON:
`https://system.spektrix.com/vashoncenter/api/v3/events` and
`.../instances?cancelled=false`. Verified 2026-05-29: 166 events / 305
instances, fetched cleanly with no auth and no 403.

~130 of the events are the venue's dance-school classes / summer camps
(flagged `attribute_Jackrabbit: true`); the ripper filters those out,
leaving ~36 genuine public performances, exhibitions, and screenings.

Implemented as a custom Spektrix `JSONRipper`-style ripper at
`sources/vashon_center_for_the_arts/` (modeled on `sources/can_can`,
which uses the same Spektrix events+instances pattern). If GH Actions
runner IPs get 403'd, escalate to `proxy: "outofband"`.
