---
name: "Cascade Bicycle Club"
status: candidate
firstSeen: 2026-06-10
lastChecked: 2026-06-10
tags: [Cycling, Community]
---
**Cascade Bicycle Club** — `https://cascade.org/rides-events` — Seattle's major cycling club with 100+ events: major rides (Seattle to Portland, Emerald City Ride, RSVP), free group rides, and community events.

Investigated 2026-06-10:
- Drupal CMS (custom, no standard ICS/iCal export found)
- No Tribe Events plugin; no `/jsonapi/` endpoint confirmed
- Main events URL: `https://cascade.org/rides-events` (note: `cascade.org/events` 404s)
- Events use URL pattern `/rides-events/[slug]`
- 200 OK accessible; large volume of events
- Implementation path: Custom HTML or JSON ripper via Drupal JSON API investigation; 🔴 Low confidence tier — moderate effort needed

Next steps: Investigate Drupal JSON API (`/jsonapi/`) endpoints for structured event data before implementing custom scraper.
