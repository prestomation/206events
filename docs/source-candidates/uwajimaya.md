---
name: Uwajimaya
status: added
platform: Instagram (type=instagram, LLM/vision cache-backed)
url: https://www.instagram.com/uwajimaya/
tags: [Community, "International District", Food]
firstSeen: 2026-07-12
lastChecked: 2026-07-12
pr: 920
---

Surfaced from a poster lookup (`skills/source-from-event`) for an Instagram
post promoting the "Uwajimaya Summer Festival" — a free, family-friendly
street fair, July 18–19, 2026, 11am–5pm, on 6th Ave S & S Weller St, just
north of the flagship Seattle store (600 5th Ave S, Chinatown-International
District). `skills/event-lookup` found no existing 206.events source
covering this event or venue.

Uwajimaya is a family-owned Asian grocery & gift market chain (Seattle,
Bellevue, Renton, and Beaverton OR), founded 1928.

## Website: not viable

A general source-discovery pass on 2026-07-01 marked `uwajimaya.com` "Not
Viable" — no ICS feed, no JSON-LD event data, no dated event listings
(`docs/discovery-log/2026-07-01.md`). That check covered the website only,
not Instagram.

## Instagram: viable

`@uwajimaya` (checked 2026-07-12): public (`is_private: false`), 43,437
followers, active — 12 recent posts returned by the mobile web profile API,
including the Summer Festival flyer. Viable per
`skills/source-from-event/SKILL.md` step 3.5a.

**Resolution: added via the `instagram` source type**, same pattern as
`freeze-tag-events`/`mixmix-socials`. Multi-location chain
(Seattle/Bellevue/Renton/Beaverton) posting from one account —
`geo: null` at the ripper level; per-event location comes from the cache.
Implemented as `sources/uwajimaya/ripper.yaml` (`config.username:
uwajimaya`), seeded into `instagram-cache.json` via the
`instagram-source` skill:

- 1 event (a two-day festival, same title both days) recorded from its own
  dedicated carousel post, expanded into two dated entries under synthetic
  ids `DalGy4PkxBA-day-1` / `DalGy4PkxBA-day-2` (see the "same-title
  multi-day" convention added to `docs/instagram-source.md` in this PR) —
  location resolved to the 6th Ave S & S Weller St intersection via a new
  `KNOWN_VENUE_COORDS` entry in `lib/geocoder.ts` (Nominatim doesn't resolve
  bare street intersections).
- 11 purely promotional/product posts (recipes, seasonal product features,
  a contest result, a sponsorship promo) marked `isEvent: false`.

Refreshed on a schedule by re-running the `instagram-source` skill against
`@uwajimaya`; past events pruned with `instagram-cache.py prune`.
