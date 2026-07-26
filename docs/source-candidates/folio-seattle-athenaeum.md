---
name: "Folio: The Seattle Athenaeum"
status: notviable
platform: Wix (events-viewer widget)
url: https://www.folioseattle.org/programs
tags: [Community, "Pike Place Market"]
firstSeen: 2026-07-26
lastChecked: 2026-07-26
---

Membership library & cultural center at 93 Pike St #307, Pike Place Market.
Hosts book/art discussions, community dinners, open mic nights, and
intimate concerts (17 events found across Jul–Sep 2026 window, e.g. "Oud:
A Musical History," "Confronting Racism: Imagining a More Perfect Union,"
weekly "What Are You Reading?" discussions).

Investigated 2026-07-26: site runs on Wix using the `events-viewer`
client-side widget (`static.parastorage.com/services/events-viewer/...`).
The initial HTML is a shell — no event data, JSON-LD, or embedded warmup
payload found in the static response. Probed common Wix Events REST paths
(`_api/wix-events-web/events`, `/rendered-list-widget/events`) — all 404.
No public API without browser rendering. Not viable without headless
browser automation we don't have; re-check if Wix adds a public events API
or the org migrates platforms.
