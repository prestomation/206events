---
name: "West Seattle Nursery"
status: added
platform: Squarespace
url: https://www.westseattlenursery.com/events-classes
tags: [Community, "West Seattle"]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---
**West Seattle Nursery & Garden Center** — `https://www.westseattlenursery.com/events-classes` — garden center at 5275 California Avenue SW (Alaska Junction, West Seattle) hosting gardening classes, an art walk, plant clinics, and community workshops.

Investigated 2026-07-02:
- Squarespace confirmed (`collection.typeName: "events"`)
- `/events-classes?format=json` returns 5 upcoming events with real epoch `startDate` timestamps in `upcoming` (Closing early on July 4th, Art Walk at West Seattle Nursery, Container Gardening Do's and Don'ts, King County Master Gardener Clinic, Create your own bonsai with Bonsai X)
- Implemented as a standard `squarespace` ripper — 5 events confirmed live via `ONLY_SOURCE` build
- `sources/west_seattle_nursery/ripper.yaml`
