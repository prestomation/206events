---
name: "SOL Yoga Seattle"
status: added
platform: Squarespace
url: https://www.solyogaseattle.com/events
tags: [Wellness, Leschi]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
pr: 825
---
**SOL Yoga Seattle** — `https://www.solyogaseattle.com/events` — yoga studio with two spaces ("SOL Up" and "SOL Down") at 200 Lake Washington Blvd, Leschi/Madison Valley, on the lake next to Daniel's Broiler. Hosts special events beyond regular class schedule: sound baths, "SOL Reset" workshops, artist-inspired themed classes, and live-music classes.

Investigated 2026-07-02:
- Squarespace confirmed, `events-stacked` collection type
- `/events?format=json` returns 1 upcoming event (**SOL Sound Bath**, July 24, 2026) and 30 past entries showing an active recurring cadence of special events roughly every 2-4 weeks (Sound Baths, Reset workshops, themed classes) going back to at least December 2025
- Implemented as `sources/sol_yoga_seattle/ripper.yaml` (built-in `squarespace` type), confirmed 1 event live via `ONLY_SOURCE` build
- `geo`: single fixed venue location (both "SOL Up"/"SOL Down" rooms share one address)
- Neighborhood is Leschi/Madison Valley; CI's `check-discovery-api` requires a registered neighborhood tag for any source with a fixed `geo`, so registered `"Leschi"` in `city.config.ts`'s `neighborhoods` list and tagged the source with it
