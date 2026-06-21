---
name: "Capitol Hill Block Party"
status: notviable
platform: Squarespace (page type) / Eventim ticketing
url: https://www.capitolhillblockparty.com/
tags: [Music, Arts, "Capitol Hill"]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Annual 3-day music and arts festival in Capitol Hill organized by Daydream State. 28th annual edition in 2026. 2026 dates: August 7–9 at Cal Anderson Park / Broadway area. 70+ artists across multiple stages. GA 3-day pass $199+.

Investigated 2026-06-21:
- Website: `capitolhillblockparty.com` — Squarespace confirmed
- `/?format=json` returns Squarespace type 10 (page), `itemCount: 0` — not an events collection, no machine-readable event data
- Tickets sold via Eventim (not Eventbrite) — no Eventim API currently supported
- No Tribe Events ICS, no public API found
- **Date pattern inconsistency**: 2023 Jul 21–23 (3rd Fri-Sun of July), 2024 Jul 19–21 (3rd Fri-Sun of July), 2026 Aug 7–9 (1st Fri-Sun of August) — dates shifted ~2 weeks between years; cannot reliably implement as a recurring YAML

**Verdict**: Not viable — no machine-readable event feed; inconsistent date pattern makes recurring YAML error-prone. Could be added as an annual one-off entry once a stable pattern or feed emerges. Revisit if they adopt a calendar platform.
