---
name: "Madison Park Farmers Market"
status: candidate
platform: Recurring (seasonal weekly)
url: https://www.friendsofmadisonpark.com/farmers-market
tags: [FarmersMarket, "Madison Park"]
firstSeen: 2026-07-25
lastChecked: 2026-07-25
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
