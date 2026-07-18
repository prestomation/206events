---
name: "Browne Family Vineyards - Seattle"
status: candidate
platform: Squarespace (multi-city collection, requires location filter)
url: https://www.brownefamilyvineyards.com/events
tags: [Food, "Pub Trivia"]
firstSeen: 2026-07-18
lastChecked: 2026-07-18
---

Walla Walla-founded winery with a Pioneer Square tasting room at 413 1st
Ave S, Seattle, WA 98104. Hosts recurring Seattle Trivia Night and Seattle
Bingo Night events plus occasional wine classes, alongside an off-site
cocktail class at Tulio Ristorante (1100 5th Ave, downtown Seattle).

Investigated 2026-07-18:
- Squarespace confirmed (`/events?format=json` returns a real
  `events-stacked` collection)
- The collection is **multi-city**: 27 upcoming items across Seattle,
  Bellevue, Tacoma, Walla Walla, and Spokane tasting rooms — only a
  minority (4 of 27) are Seattle events, so the built-in `squarespace`
  ripper type isn't a direct fit; needs a custom ripper that filters
  `location.addressLine2` starting with `"Seattle"` before mapping events
- Filtered to Seattle: 4 upcoming (Summer on Spring Street Cocktail Class
  at Tulio Ristorante, Seattle Bingo Night, Seattle Trivia Night, Browne U:
  Barrel Aged Wine & Spirits) and 7 in `past` over the last ~6 months,
  confirming an ongoing recurring cadence (not a one-off)
- Multiple distinct Seattle addresses (413 1st Ave S tasting room + Tulio
  Ristorante downtown) → `geo: null` at the ripper level, per-event
  location strings resolved via the geo-cache like other variable-location
  sources
- 🟡 Medium confidence — Squarespace collection confirmed working, but
  needs custom location-filtering logic (not the plain built-in type)
