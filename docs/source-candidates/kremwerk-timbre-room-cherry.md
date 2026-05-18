---
name: "Kremwerk + Timbre Room + Cherry"
status: candidate
firstSeen: 2026-05-08
lastChecked: 2026-05-18
tags: [Music, Nightlife]
---
**Kremwerk + Timbre Room + Cherry** — Queer electronic/nightlife venue complex in Denny Triangle — Tags: Music, Nightlife

Investigated 2026-05-08:
- Squarespace `?format=json` returns `itemCount: 0` — JS-rendered events on the venue website, no Squarespace events collection

Re-investigated 2026-05-18:
- Confirmed DICE presence: `dice.fm/venue/kremwerk-complex-xmra`
- Search agent confirmed 30+ events per month (electronic, drag, queer nightlife)
- Built-in `dice` ripper type supported: `venueName: "Kremwerk Complex"`
- Address: Denny Triangle, Seattle
- Note: Cannot verify exact DICE API venue name without `DICE_API_KEY` — needs CI verification
- Next step: implement with `type: dice`, `venueName: "Kremwerk Complex"` and verify event count in CI
