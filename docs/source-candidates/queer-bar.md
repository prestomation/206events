---
name: "Queer/Bar"
status: added
pr: 272
platform: Squarespace
url: https://thequeerbar.com/calendar
tags: [Nightlife, "Capitol Hill"]
firstSeen: 2026-05-08
lastChecked: 2026-09-12
---

LGBTQ+ venue at 1518 11th Ave, Capitol Hill. Regular drag shows, DJ nights,
comedy.

Investigated 2026-05-08 → 2026-05-13: the `/events-one` page looked like a
regular Squarespace page (type 1, itemCount 1249, `?format=json` returning 0
items), so this file was marked `notviable`.

**Correction (2026-09-12):** the venue's actual Squarespace events collection
lives at `/calendar`, not `/events-one` — a different URL was the real
events feed all along. `sources/queer_bar/ripper.yaml` implements it as a
`SquarespaceRipper` subclass (PR #272), later patched for a URL 404 in
PR #1023, and is live today (`expectEmpty: true`, verified 2026-07-06).
Flipping this file's status to `added` to match; the `notviable` verdict here
was based on the wrong URL, not a real platform limitation.
