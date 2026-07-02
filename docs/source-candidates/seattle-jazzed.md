---
name: "Seattle JazzED"
status: candidate
platform: Squarespace
url: https://www.seattlejazzed.org/events
tags: [Music]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---
**Seattle JazzED** — `https://www.seattlejazzed.org/events` — South Lake Union-based youth jazz education nonprofit hosting free public performances by its student ensembles (Summer Jazz Lab, Femme Jazz, Summer Connections camps) at Amazon Van Vorst Plaza and other Seattle locations, plus appearances at events like the Seafair Torchlight Parade.

Investigated 2026-07-02:
- Squarespace confirmed (`collection.typeName: "events"`)
- `/events?format=json` returns 4 upcoming events with real epoch `startDate` timestamps in `upcoming` (Summer Jazz Lab Performance, Femme Jazz Summer Camp Performance, Torchlight Parade appearance, Summer Connections Camp Performance)
- Events occur at varying locations (own building + Amazon Van Vorst Plaza + parade route), so `geo: null` at the ripper level with per-event geocoding
- Implemented as a standard `squarespace` ripper — 4 events, 0 errors confirmed live via `ONLY_SOURCE` build
- `sources/seattle_jazzed/ripper.yaml`
