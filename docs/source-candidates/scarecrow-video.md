---
name: Scarecrow Video In-Store Events
status: blocked
platform: Unknown
url: https://scarecrowvideo.org/features/in-store-events
tags: [Film, Learning]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr:
---

Scarecrow Video, Seattle's legendary video store, hosts in-store events, screenings, and discussions.

**Vetting notes (2026-08-14):** Blocked — two separate WebFetch attempts both
returned HTTP 429 (Too Many Requests), likely rate-limiting/bot protection.
Could not confirm platform, event listing format, or feed availability.
Scarecrow Video is a well-known, real Seattle institution so this is likely
viable; needs a re-check from a different fetch path (e.g. browser-based
fetch) rather than repeated WebFetch attempts against the same endpoint.

**Re-checked 2026-09-23:** Blocked. Plain curl gets HTTP 429 with a **Vercel Security Checkpoint** JS challenge page (`server: Vercel`) on both `/` and `/features/in-store-events`; WebFetch also gets 429. No alternate feed (ICS, Eventbrite, etc.) turned up in a web search. It would need a JS-executing fetch (browserbase) to read the page.
