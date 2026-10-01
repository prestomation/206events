---
name: "Sake Noire"
status: candidate
platform: Squarespace
url: https://www.sakenoire.com/jazz-industry-events
tags: [Music, "Rainier Valley"]
firstSeen: 2026-10-01
lastChecked: 2026-10-01
pr:
---

Sake and jazz bar at 5701 Rainier Ave S, Hillman City, Seattle, WA 98118
(opened July 1, 2026). Hosts a monthly speakeasy-style "Sake x Jazz"
night spotlighting BIPOC and women musicians, plus occasional sake
pop-ups/tastings.

Investigated 2026-10-01:
- Squarespace confirmed (`server: Squarespace` header)
- `/jazz-industry-events?format=json` — real `events-stacked` collection,
  but `upcoming: 0`, `past: 9` at time of check
- `/sake-events?format=json` is a second collection but type
  `blog-side-by-side` (not events) — its 12 `items` are recap/blog posts
  about past pop-ups (e.g. "Sake x Dumplings at OHSUN Banchan"), not a
  dated-events feed; `publishOn` timestamps, no `startDate`
- `/tickets-events?format=json` is a `products` (Squarespace commerce)
  collection with 1 item ("Sake Tachinomi") — a sellable product, not an
  events listing
- Press coverage confirms a monthly "Sake x Jazz" series exists, but with
  no fixed day-of-week (dates vary month to month per past post titles),
  so it's not recurring-YAML material either

Per the "200 + 0 events" rule, do not implement yet. Re-check
`/jazz-industry-events?format=json` next cycle — once a future "Sake x
Jazz" date is posted there, this is a 🔥 High-confidence built-in
`squarespace` candidate.
