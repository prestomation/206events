---
name: "Filipino Community of Seattle"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/o/filipino-community-of-seattle-56553753403
tags: [Community, "Rainier Valley"]
firstSeen: 2026-05-08
lastChecked: 2026-07-02
pr: pending
---
**Filipino Community of Seattle** — Wix site (`filcommsea.org`), heavily JS-dependent with no server-rendered event data — not viable directly. The org also lists events via an Eventbrite organizer (`56553753403`).

Re-checked 2026-06-30 and 2026-07-02: Eventbrite organizer confirmed 1 live upcoming event both times ("FCS presents Iskwelahang Pilipino of Boston's 'Musikang Kalipay'", July 3, 2026). The org's primary Wix calendar isn't machine-readable, so long-term volume via Eventbrite alone is uncertain, but per project policy low-volume sources are still valid.

Implemented 2026-07-02 as `sources/filipino_community_seattle/ripper.yaml` (built-in Eventbrite type). Registered new "Rainier Valley" neighborhood tag in `city.config.ts` for the Filipino Community Center (5740 Martin Luther King Jr Way S, Seattle, WA 98118).

Confirmed via web search this is an ongoing pattern, not a one-off booking: the same organizer (`56553753403`) previously listed "One Night In Seattle (Filipino History Month Event)" (Oct 2024) and "Talipapa Market Cultural Festival 2025" (Oct 2025) on Eventbrite — roughly one dated event per year posted there, consistent with the org's broader (non-Eventbrite) event calendar.
