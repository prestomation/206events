---
name: "Actualize AiR (Artist in Residency)"
status: added
pr: 824
platform: Eventbrite
url: https://actualize.space
tags: [Arts, "Pioneer Square"]
firstSeen: 2026-07-01
lastChecked: 2026-07-02
---

**Actualize AiR** — `https://actualize.space` — women-founded, artist-led artist-in-residency organization in Pioneer Square. 14,000 sq ft space at 112 Prefontaine Place S with 35 studios, co-working space, and event/gallery space. Hosts panel discussions, open-studio after-parties, and gallery openings.

Investigated 2026-07-01:
- Site embeds a SociableKit Eventbrite widget (`data-embed-id='25551373'`) pointing at Eventbrite organizer **87597942133** (`eventbrite.com/o/actualize-air-87597942133`)
- Search snippet suggested "1 Upcoming Activities and Tickets" as of check date; confirmed the org ID is correct for the art residency (not the unrelated "Actualize" coding bootcamp, `eventbrite.com/o/actualize-12859037550`)
- Address confirmed via Nominatim: 112 Prefontaine Place S, Seattle, WA 98104 (47.6014716, -122.3293982)
- Built-in `eventbrite` ripper type applies (same pattern as `sources/club_sur`); requires the existing `EVENTBRITE_TOKEN` repo secret already wired into CI — no new credential needed
- **Implemented and reverted 2026-07-01 (PR #804):** CI build ran the live Eventbrite API with a valid `EVENTBRITE_TOKEN` (confirmed via other organizerId-based sources like `cd-art-walk` returning real events in the same build) and the organizer returned **0 live events** — the "1 Upcoming Activities" search snippet was evidently stale. Per the "never add a 0-event new source" rule, the ripper was reverted before merge. Re-check when the org next posts a live Eventbrite event.

Re-investigated 2026-07-02:
- Fetched `https://www.eventbrite.com/o/actualize-air-87597942133` directly — the organizer profile now lists 3 upcoming dated events: "Figure Drawing Series [July]", "[August]", "[September]" (`numEvents: 41` on the organizer record, `hostingSince: 1`)
- Fetched one event page directly (`/e/figure-drawing-series-july-tickets-1992867011879`) — confirmed `"status":"live"`, a working "Get tickets" CTA, and `"organizer":{"id":"87597942133", ...}` matching the same organizer ID used in the reverted attempt — this is not a stale search snippet, it's a live purchasable listing tied to the exact organizer ID the ripper queries
- Re-implementing with the same `eventbrite` ripper config as the reverted PR #804 attempt. Since events are confirmed live only 1 day after the prior 0-event CI result, the org appears to publish in bursts — CI's live API call will be the final confirmation this time
- **Confirmed 2026-07-02 (PR #824):** CI's live Eventbrite API call returned 3 events (Figure Drawing Series July/August/September). Source added.
