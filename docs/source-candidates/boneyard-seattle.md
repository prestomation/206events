---
name: Boneyard Seattle
status: investigating
platform: Wix (widget-rendered calendar)
url: https://www.boneyardseattle.com/events-1
tags: [Nightlife, Music]
firstSeen: 2026-08-14
lastChecked: 2026-08-31
---

Seattle bar and music venue with an events calendar for live shows and nightlife.

**Checked 2026-08-14:** Real venue (Squarespace-hosted bar + indoor dog
park combo). ~8 events listed (Puppy Social, Live Music with Moon Ghost,
Small Dog Meetup, Burlesque with Ryder Nightlong, Midsummer Night's
Dream BBQ & Rave, Bully Breed Meetup, etc) but **no dates/times are
present in the static HTML** — same result via the Squarespace
`?format=json` endpoint, which also came back without structured date
fields. Likely a JS-rendered booking widget rather than a plain event
list. Needs deeper digging (browser render, or finding the underlying
booking-system API) to confirm actual schedule/volume before a
viability call.

Re-checked 2026-08-31: corrected platform — the site is actually
**Wix**, not Squarespace (the `?format=json` 404 from the prior check
makes sense in hindsight; that endpoint only exists on Squarespace).
Confirmed a `wix-events` widget reference in the page markup, but no
inline JSON event data in the static HTML — same client-rendered
limitation as other Wix-hosted candidates in this backlog (Blue Moon
Tavern, Southside Revolution). No change to status.
