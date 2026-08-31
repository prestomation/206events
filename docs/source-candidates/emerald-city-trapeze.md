---
name: "Emerald City Trapeze"
status: candidate
platform: Custom HTML (WordPress)
url: https://emeraldcitytrapeze.com/shows/
tags: [Circus, SODO]
firstSeen: 2026-08-31
lastChecked: 2026-08-31
---

SoDo flying-trapeze and aerial-arts school (2702 6th Ave South) that
also runs periodic public shows (Carnevolar, an annual Halloween circus
show now in its 14th year; occasional fundraiser soirées).

Investigated 2026-08-31: `/shows/` returns HTTP 200, server-rendered
HTML. Only **1 confirmed future public show** at time of check —
"Carnevolar XIV: Ascension" (Oct 29–31, 2026); the other listed show
("The Trapeze Soirée", Aug 29, 2026) had already passed. A page-level
JSON-LD `SocialEvent` block exists but carries a stale `startDate` from
2024 — not reliable for parsing, would need per-format free-text date
parsing off the visible show cards instead. No ICS/JSON API found.

🔴 Low priority: real venue with a track record of recurring annual
shows, but currently only 1 confirmed future date is too thin to
implement against (risk of 0-events shortly after Halloween passes,
until the next show is announced). Re-check closer to when a new show
gets posted, or once 2+ concrete public dates are live simultaneously.
