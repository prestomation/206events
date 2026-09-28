---
name: Occidental Fine Arts Center
status: candidate
platform: PublicDisplay.ART (Conru Art Foundation aggregator) — org id 774
url: https://occidentalfinearts.org/events
tags: [Arts, Pioneer Square]
firstSeen: 2026-09-28
lastChecked: 2026-09-28
pr:
---

Gallery, studios, and workshop space in Pioneer Square (311 1/2 Occidental
Ave South, Seattle, WA), part of the same Conru Art Foundation family as
Art Love Salon (`sources/art_love_salon/`). Hosts First/Second/Third
Thursday art-walk programming, live jazz, life-drawing sessions, author
talks, and workshops.

Its own site (`occidentalfinearts.org/events`) is a Next.js app whose
events list loads client-side (no embedded RSC data, unlike
`publicdisplay.art` — the "Loading events" skeleton is the only thing in
the initial HTML), so it's not fetchable via plain HTTP the way Art Love
Salon's site turned out to be.

**However**, it's confirmed to be one of the organizations already
present in the `publicdisplay.art/calendar` RSC payload that
`sources/art_love_salon/ripper.ts` already parses (`docs/source-candidates/publicdisplay-art.md`'s
2026-09-23 note flagged it as a lead). Verified 2026-09-28 by fetching
`https://publicdisplay.art/calendar` and extracting `initialEvents`:

```
org: {"name": "Occidental Fine Arts Center", "street": "311 1/2 Occidental Ave South",
      "city": "Seattle", "state_code": "WA", "id": 774, "neighborhood": "pioneer_square"}
```

6 future single-day events found for org id `774` (through late October
2026): First Thursday Art Walk, Second/Third Thursday live music & life
drawing, an author conversation, and a Halloween yoga class.

**🔥 High confidence** — same proven data pipeline as `art_love_salon`
(same aggregator, same RSC-payload + per-event-detail-page pattern for
real clock times). Two implementation options for whoever picks this up:
1. Extend `sources/art_love_salon/ripper.ts`'s `ORG_IDS` set to include
   `774`, generalizing the single hardcoded `LOCATION` constant into an
   org-id → location map (Occidental Fine Arts Center's address differs
   from Art Love Salon's 110 Union St).
2. Or split into its own small ripper reusing the same
   `extractNextFlightData`/`extractJsonAfterMarker` helpers (consider
   promoting those two functions to a shared lib module if a third
   Conru-family org ever needs this pattern, rather than duplicating
   them a second time).
