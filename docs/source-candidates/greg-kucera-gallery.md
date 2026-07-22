---
name: "Greg Kucera Gallery"
status: candidate
platform: Squarespace
url: https://gregkucera.com/events
tags: [Arts, "Pioneer Square"]
firstSeen: 2026-07-16
lastChecked: 2026-07-22
---

Contemporary art gallery in Pioneer Square. Hosts First Thursday events,
artist talks, and scavenger hunts alongside its exhibition schedule.

Investigated 2026-07-16:
- Squarespace confirmed (`server: Squarespace` header, `squarespace-cdn.com`
  assets)
- `/events?format=json` returns a real `events-stacked` collection, but
  `upcoming: []` (0 events) — all 19 items are in `past` (First Thursday:
  Offerings from the Secondary Market, Artist Talk: Dan Webb, Scavenger
  Hunt, etc., most recently Dec 2025–Feb 2026)
- Per the "200 + 0 events" rule, do not implement yet — re-check next
  cycle to see if new First Thursday / artist-talk events get posted

Re-checked 2026-07-22: still 0 upcoming events (Squarespace `?format=json` upcoming array empty, or Eventbrite organizer `upcomingEvents` empty). No change.
