---
name: "Woodinville Wine Country"
status: investigating
platform: WildApricot (RSS feed)
url: https://woodinvillewinecountry.org/events
tags: []
firstSeen: 2026-09-25
lastChecked: 2026-09-25
---

Wine-industry trade association for the Woodinville wine region (King
County). Site runs on WildApricot and exposes a genuine events RSS feed
at `https://woodinvillewinecountry.org/events/RSS` (linked via
`<link rel="alternate" type="application/rss+xml">` in the page head) —
real `<item>`s with `pubDate`, `title`, `link`, HTML `description`.

Checked 2026-09-25: only **2 upcoming items** at time of check —
"Coffee Collab" (member town-hall meetup, Oct 14 2026) and "WA State
Wineries @ WCW" (explicitly labeled "INDUSTRY ONLY EVENT — PLEASE JOIN
US - RSVP TODAY" in its description, Dec 3 2026). Both read as
trade/member programming for wineries themselves rather than
public-facing consumer events — a poor fit for a public event calendar
even though the feed volume issue alone wouldn't disqualify it (per the
"low-volume sources are valid" directive). The direct Woodinville
Chamber of Commerce site (`woodinvillechamber.org/cal-events/`) — a
plainer public events calendar — returned HTTP 403 in the same check.
Left as `investigating`; re-check if the RSS feed ever surfaces
public-facing tasting/festival events rather than member-only meetings.
