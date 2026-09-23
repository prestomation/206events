---
name: Boneyard Seattle
status: added
platform: Wix (CMS repeater, wix-warmup-data)
url: https://www.boneyardseattle.com/events-1
tags: [Nightlife, Music]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr: 1571
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

Added 2026-09-23 as `sources/boneyard_seattle/` (custom ripper, source name `boneyard-seattle`). The `/events` page is a Wix CMS repeater bound to the `EventsAtTavern` collection, and Wix server-renders the records (ISO `date`, free-text `time1` like "09/11, 7-9pm", `eventName`, `category`, `image`) into the `wix-warmup-data` script — the ripper reads only that collection, parses the time text (start + range duration), skips "Bar closed" hours notices and past dates, and emits an `UncertaintyError` (startTime) when a listing has no time. Venue: 2603 S Jackson St, Seattle 98144 (Central District). `ONLY_SOURCE=boneyard-seattle` build: 2 upcoming events (7 total in the current list, rest already past), 0 errors. The owner updates the list roughly monthly, so volume is low and can briefly drop to 0 between refreshes.
