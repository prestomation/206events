---
name: "Gallery 110"
status: added
firstSeen: 2026-05-16
lastChecked: 2026-05-21
tags: [Arts, "Pioneer Square"]
pr: TBD
---
**Gallery 110** — `https://gallery110.com/events` — 110 3rd Ave S, Pioneer Square. Squarespace site with events-stacked collection type. Tags: Arts, Pioneer Square.

Investigated 2026-05-16:
- Squarespace confirmed (squarespace-cdn.com image URLs, `?format=json` returns collection data)
- Collection type: `events-stacked`
- `upcoming: 0` events returned from the API as of 2026-05-16
- `past: 30` entries (art shows from Oct 2025 - May 2026, most now ended)
- Per-event ICS download links present on individual event pages (not a master feed)
- Currently has 0 upcoming events — not viable to add right now (build would fail on 0 events)

Re-checked 2026-05-21:
- New programming confirmed: 3 upcoming events for June 2026 (Art Walk Openings Jun 5, Artist Panel Discussion Jun 13, Closing Reception Jun 27)
- All events are "Gage Academy Drawing Seminar & Denise Emerson" exhibition events
- Implemented as `sources/gallery_110/` using the built-in `squarespace` type
</content>
</invoke>