---
name: "PublicDisplay.ART"
status: candidate
platform: unknown (custom Next.js app)
url: https://publicdisplay.art/calendar
tags: [Arts, Community]
firstSeen: 2026-08-21
lastChecked: 2026-08-21
---

Self-described "non-profit arts portal connecting Seattle's creative
community with patrons and art lovers" — a citywide aggregator, not a
single venue (sourceRole would be `aggregator`, geo: null). Calendar
page shows 30-60+ events/day across late Aug–Sept 2026: neighborhood
art walks (Chinatown/ID, Queen Anne, Pioneer Square, Ballard, Capitol
Hill, Fremont, Georgetown), gallery exhibitions, music (jazz jams,
symphony), workshops, and theater productions.

Investigated 2026-08-21:
- Site is a Next.js app (`x-powered-by: Next.js`, RSC headers on
  response) — no ICS/iCal export, no documented API found in the
  rendered page.
- `/sitemap.xml` returns the app's not-found page, not a sitemap.
- Given the breadth (many events are individual venues/orgs already
  covered by their own dedicated sources in this repo), this would need
  careful cross-source dedup consideration and is a 🔴 Low-confidence
  custom-scrape candidate at best — likely needs JS rendering
  (browserbase-tier) to extract data, since Next.js RSC payloads aren't
  always present in the plain HTML fetch.

**Recommended next step**: inspect the Network tab for the actual
`/calendar` page (via browser dev tools) to find the underlying data
fetch (RSC flight data or a JSON API) before attempting a scraper. Not
attempted this cycle — flagging as a candidate for a follow-up
investigation session with browser access.
