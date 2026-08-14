---
name: Boneyard Seattle
status: investigating
platform: Squarespace
url: https://www.boneyardseattle.com/events-1
tags: [Nightlife, Music]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
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
