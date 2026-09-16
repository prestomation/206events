---
name: "Emerald City Trapeze"
status: notviable
platform: Custom HTML (WordPress)
url: https://emeraldcitytrapeze.com/shows/
tags: [Circus, SoDo]
firstSeen: 2026-08-31
lastChecked: 2026-09-16
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

**Re-checked 2026-09-16, marked not viable as a standalone source:**
while investigating this page's "Carnevolar XIV: Ascension" show, found
its Eventbrite ticket link resolves to organizer `44465040643`, whose
account name is **SANCA** — Emerald City Trapeze Arts has been run by
SANCA (School of Acrobatics and New Circus Arts) since 2023. SANCA's
Eventbrite organizer is already implemented as `sources/sanca`
(`status: added`, PR #1341, see `docs/source-candidates/sanca-seattle.md`)
and covers this venue's public shows (confirmed: the 3 live Carnevolar
nightly occurrences at time of check). No separate ripper needed for
`emeraldcitytrapeze.com` itself.
