---
name: "Madison Park Farmers Market"
status: added
platform: Recurring (seasonal weekly)
url: https://seafarmersmarket.com/markets/madison-park-farmers-market
tags: [FarmersMarket, "Madison Park"]
firstSeen: 2026-07-25
lastChecked: 2026-07-28
pr: 1046
---

Weekly farmers market run by Friends of Madison Park.

- Season: Saturdays, May 16 – October 10 (2026), 10am–2pm
- Location: E Madison St & 42nd Ave E, Seattle, WA 98112
- No ICS/API found on `friendsofmadisonpark.com` — static informational
  page with a fixed schedule. Fits `sources/recurring/<name>.yaml`
  (fixed weekly schedule + `seasonal` restriction), same shape as the
  other neighborhood farmers markets already in `sources/recurring/`.
- Not covered by any existing `sources/recurring/*-farmers-market.yaml`
  entry or by `docs/source-candidates/seattle-farmers-markets.md`.
- **Checked for overlap with `sources/friends_of_madison_park/` (the
  same parent org, `status: added`, PR #676, Squarespace type):** fetched
  `https://www.friendsofmadisonpark.com/allevents?format=json` directly
  and confirmed its 21 upcoming items are one-off community events
  (book clubs, "Music in the Park", "Madison Park Garage Sale",
  "Madison Park Artisan Market", "Madison Valley Little Courtyard
  Market", etc.) — no "Madison Park Farmers Market" entry among them.
  The farmers market is promoted on a separate static page
  (`/farmers-market`) outside that Squarespace events collection, so
  implementing this as its own recurring entry would not double-cover
  anything already surfaced by the existing ripper.

Sources:
- https://www.friendsofmadisonpark.com/farmers-market
- https://everout.com/seattle/events/madison-park-farmers-market/e210511/

Implemented 2026-07-28: the `friendsofmadisonpark.com/farmers-market` FAQ
turned out to be stale (still shows the 2025 season dates and says "2026: To
be determined"), so the 2026 season was instead confirmed via the operator's
own site — the market is run by the **Seattle Farmers Market Association**
(same org as `sources/recurring/ballard-farmers-market.yaml` and
`central-district-farmers-market.yaml`), which publishes it at
`seafarmersmarket.com/markets/madison-park-farmers-market` with structured
JSON-LD (`openingHours: "Sa 10:00-14:00"`, `description: "...second season
for 2026..."`) confirming Saturdays 10am–2pm, seasonal May–October. Added as
`sources/recurring/madison-park-farmers-market.yaml` (every Saturday, 10:00,
PT4H, `months: [5,6,7,8,9,10]`; geo from the page's JSON-LD coordinates).
Verified locally via `ONLY_SOURCE=madison-park-farmers-market npm run
generate-calendars` — 1 event, 0 errors, outdoor weather badge applied.
