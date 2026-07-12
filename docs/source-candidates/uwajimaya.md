---
status: investigating
---

# Uwajimaya

Family-owned Asian grocery & gift market chain (Seattle, Bellevue, Renton, and
Beaverton OR), founded 1928. The flagship Seattle store anchors the
Chinatown-International District (600 5th Ave S) and hosts community events
(e.g. the annual free Uwajimaya Summer Festival street fair on 6th & Weller,
just north of the store).

## Discovery context

Surfaced via a poster lookup (`skills/source-from-event`): an Instagram post
from `@uwajimaya` promoting the 2026 Summer Festival (July 18–19, 2026,
11am–5pm, 6th & Weller St, Seattle). `skills/event-lookup` found no existing
206.events source covering this event or venue.

## Prior investigation

A general source-discovery pass on 2026-07-01 marked the Uwajimaya website
"Not Viable" — no ICS feed, no JSON-LD event data, no dated event listings
(`docs/discovery-log/2026-07-01.md`). That check covered `uwajimaya.com`
only, not the Instagram account.

## Instagram viability check

`@uwajimaya` (2026-07-12): public (`is_private: false`), 43,437 followers,
active — 12 recent posts returned by the mobile web profile API, including
the Summer Festival flyer. Viable per `skills/source-from-event/SKILL.md`
step 3.5a.

## Implementation

Multi-location chain (Seattle/Bellevue/Renton/Beaverton) posting from one
account — `geo: null` at the ripper level, same pattern as
`freeze-tag-events`/`mixmix-socials`. Per-event location comes from the cache
(flyer/caption), consistent with the "First-party host, multi-location"
convention. Added as `sources/uwajimaya/ripper.yaml`, `type: instagram`,
seeded via `skills/instagram-source/SKILL.md`.
