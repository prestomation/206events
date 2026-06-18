---
name: Lake Union Concerts (Seattle Paddle Rave & Dock Rock)
status: added
platform: Custom HTML (lakeunionconcerts.com/tickets → posh.vip JSON-LD)
url: https://www.lakeunionconcerts.com/tickets
tags: [Music, Wallingford]
firstSeen: 2026-06-18
lastChecked: 2026-06-18
pr: 
---

Floating EDM and rock concerts on Lake Union. Two series:
- **Seattle Paddle Rave** — tech house / EDM events where attendees paddle on the water (~1,000 paddleboarders). On Lake Union near Gas Works Park.
- **Dock Rock** — rock/indie concerts from a floating home dock.

Events are free (posh.vip offers.price = 0), 18+, BYO vessel, no alcohol/cannabis.

Implemented as a custom ripper that:
1. Fetches lakeunionconcerts.com/tickets to get posh.vip event links
2. Fetches each posh.vip event page and extracts JSON-LD structured data from the Next.js App Router RSC payload

Season runs June–September 2026 with ~8 events.
