---
name: Stone Way Cafe
status: candidate
platform: Custom (unknown calendar widget)
url: https://stonewaycafe.com/events
tags: ["Wallingford"]
firstSeen: 2026-07-08
lastChecked: 2026-07-08
pr:
---

Cafe at 3510 Stone Way N hosting occasional "WIDEopen Mic" nights (music,
art, poetry) on irregular Tuesdays/Thursdays, per community open-mic
schedule roundups.

Investigated 2026-07-08: `/events` page returns HTTP 200 and has a real
calendar widget (Pinboard/Agenda/Calendar views, month filter), but no
recognizable platform signature (no Squarespace/Wix/WordPress/Tribe/
Eventbrite/Shopify markers found in the page source) — likely a custom or
niche booking widget. At time of check the calendar showed **0 events for
nearly every day in July** and only a single confirmed future item (a Labor
Day open house on September 7). Per the "200 + 0 events" rule, not enough to
implement yet.

🟡 Low priority — re-check in a future cycle to see if the platform can be
identified (view page source / network tab for the calendar widget's data
endpoint) and whether event volume picks up.
