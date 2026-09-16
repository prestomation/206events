---
name: "Midwest Coast Brewing"
status: candidate
platform: Squarespace
url: https://www.midwestcoastbrewing.com/upcoming
tags: [Beer]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
---

Seattle brewery/taproom. Search results describe recurring trivia, music
bingo, dog-friendly events, and live music.

Investigated 2026-09-16:
- Squarespace confirmed (`squarespace-cdn.com` asset URLs)
- `/events` (nav target) 302-redirects to `/upcoming`
- `/upcoming?format=json` returns `typeName: page`, `itemCount: 0` — not a
  real Squarespace Events collection, just a static page
- The static HTML's meta description lists "Trivia, music bingo, dog
  friendly events, live music, dog market, family friendly family days,
  bike tune up, food popups, sip and pa[int]..." but none of that is
  rendered as dated content in the plain-fetched HTML (likely loaded by a
  JS widget or a Squarespace block type not present in the static
  response)
- No day/time specifics found for any series, unlike Swamp Cow Kava
  Lounge's dedicated `/weekly-events` page — not enough to hand-code a
  recurring YAML entry yet

Re-evaluate if a dated events collection or a page listing specific
day/time patterns becomes reachable.
