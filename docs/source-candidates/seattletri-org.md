---
name: 🏊 SLOWS 🏊 (Sammamish Lake Open Water Swim)
status: investigating
platform: "Custom (Laravel/Livewire SPA)"
url: https://www.seattletri.org/events/109926/swim-slows-sammamish-lake-open-water-swim-2026-08-25
tags: ["fitness", "outdoors"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
---

Discovered via aggregator gap analysis. 5 events in the Seattle
metro sample. Source domain: seattletri.org.

Sample event: "🏊 SLOWS 🏊 (Sammamish Lake Open Water Swim)" (2026-08-26T00:30:00.000Z)
Description: Evening open water swim at Sammamish Landing. For experienced open water swimmers. Bright swim cap and swim buoy required.

Re-checked 2026-09-16: `/schedule` and `/events` plain-fetch to a
near-empty shell (Laravel + Livewire app bundle, `app-*.js`) — event data is
client-rendered, no JSON API endpoint found in the static HTML. Also worth
noting: the sample event itself (Sammamish Lake) is outside Seattle proper,
consistent with this being a regional triathlon-club calendar rather than a
Seattle-specific one. Left `investigating`.
