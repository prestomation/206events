---
name: "Cascade PBS"
status: notviable
platform: Ghost CMS
url: https://www.cascadepbs.org/events
tags: [Arts, Community, Education]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Cascade PBS (formerly KCTS 9) is Seattle's public broadcasting station. Hosts local screenings, community forums, and educational events.

Investigated 2026-06-21:
- Website runs on **Ghost CMS** — a headless CMS platform
- Ghost does not provide a standard ICS/iCal export for events
- No Tribe Events, Squarespace events collection, or other supported calendar platform found
- Events appear to be published as Ghost "posts" rather than a dedicated events collection

**Verdict**: Not viable — Ghost CMS has no built-in ICS export or standard events API. Custom scraper would be required and the event volume (a few per year) likely doesn't justify the implementation effort.
