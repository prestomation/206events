---
name: "Astronomy on Tap Seattle"
status: candidate
platform: Tribe Events (WordPress REST API)
url: https://astronomyontap.org/locations/seattle-wa/
tags: ["Education"]
firstSeen: 2026-07-16
lastChecked: 2026-07-16
---

Free public astronomy lecture series organized by UW Astronomy grad
students, held at Seattle-area breweries (recently Stoup Brewing
Ballard) on roughly the 4th Wednesday of the month, 7-9pm.

Investigated 2026-07-16:
- Astronomy on Tap is a global network (dozens of city chapters) run
  off a single shared WordPress site, `astronomyontap.org`, using The
  Events Calendar (Tribe Events) plugin. Confirmed working REST API at
  `https://astronomyontap.org/wp-json/tribe/events/v1/events`.
- The default `events` endpoint returns *all* cities worldwide mixed
  together (Seattle, Lansing, Bristol, Philadelphia, Baltimore,
  Boulder, Manila, ABQ, Munich, etc. all in the same feed).
- Filtering with `?search=Seattle` correctly isolates just the Seattle
  event: confirmed a live hit — "Astronomy on Tap Seattle 109: Special
  Stars and Dark Matter" at Stoup Brewing Ballard, 2026-07-15 19:00.
  Only 1 event returned (`total: 1`) at time of check — thin, but per
  skill directive volume isn't a rejection criterion.
- No "Seattle" category/tag exists on the site (`/wp-json/tribe/events/v1/categories`
  has no Seattle entry), so `search=` is the only available filter —
  works today but is a soft/fuzzy match (a future event in another
  city with "Seattle" in its title/description would false-positive;
  low real-world risk given the naming pattern `Astronomy on Tap
  <City>` is consistent across chapters).
- Not a built-in ripper type (Tribe Events isn't in the built-in list)
  — would need a small custom `JSONRipper` subclass that queries with
  `search=Seattle` and maps Tribe's event shape to `RipperCalendarEvent`.

**Verdict**: 🟡 Medium-tier candidate — confirmed working API, but
needs a custom ripper (not a built-in type) and relies on a fuzzy
`search=` filter rather than a clean per-city id.
