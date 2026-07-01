---
name: "Actualize AiR (Artist in Residency)"
status: candidate
platform: Eventbrite
url: https://actualize.space
tags: [Arts, "Pioneer Square"]
firstSeen: 2026-07-01
lastChecked: 2026-07-01
---

**Actualize AiR** — `https://actualize.space` — women-founded, artist-led artist-in-residency organization in Pioneer Square. 14,000 sq ft space at 112 Prefontaine Place S with 35 studios, co-working space, and event/gallery space. Hosts panel discussions, open-studio after-parties, and gallery openings.

Investigated 2026-07-01:
- Site embeds a SociableKit Eventbrite widget (`data-embed-id='25551373'`) pointing at Eventbrite organizer **87597942133** (`eventbrite.com/o/actualize-air-87597942133`)
- Search snippet confirms "1 Upcoming Activities and Tickets" as of check date
- Address confirmed via Nominatim: 112 Prefontaine Place S, Seattle, WA 98104 (47.6014716, -122.3293982)
- Built-in `eventbrite` ripper type applies (same pattern as `sources/club_sur`); requires the existing `EVENTBRITE_TOKEN` repo secret already wired into CI — no new credential needed
