---
name: Freeze Tag Events
status: added
platform: Instagram (type=instagram, LLM/vision cache-backed)
url: https://www.instagram.com/freeze.tag.events/
tags: [Community]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
---

Surfaced from a poster lookup for "Little Treat Tasting & Treasure Tour"
(U-District, 7/19/2026, 11am). Freeze Tag is a real, active, recurring
Seattle experiential-events company — pop-up choirs, scavenger hunts,
murder mysteries, trivia, bingo, neighborhood tasting/treasure tours —
not a one-off. Presence: Instagram/TikTok `@freeze.tag.events`, a
linktree-style hub at `bio.link/tag_freeze`, and a Discord.

Ticketing is **TicketSpice** (`freezetag.ticketspice.com/<slug>`), one
static-ish HTML page per event (e.g. `/little-treat`, `/taskmaster-seattle`,
`/oneshotseattle`). Each page is individually parseable, but there is **no
organizer index/listing URL** — `freezetag.ticketspice.com` (bare root)
404s, and no ICS/API endpoint exists. New event slugs are announced only
via Instagram, the newsletter (Google Form signup), or Discord. So there
is no crawlable feed for a conventional ripper.

**Resolution: added via the `instagram` source type.** The account posts
each event as a dated flyer + caption, which is exactly what the
`type: instagram` ripper (cache-backed, LLM/vision read out-of-band) is
for. Implemented as `sources/freeze-tag-events/ripper.yaml`
(`config.username: freeze.tag.events`), seeded into `instagram-cache.json`
via the `instagram-source` skill. The out-of-band read of the account is
enriched by the per-event TicketSpice pages, which give authoritative
date/time/location. Refreshed on a schedule by re-running the skill; past
events pruned with `instagram-cache.py prune`.

(Previously recorded here as `notviable` under the assumption that a
source must be a hands-off automated feed. The `instagram` type — added in
this same work — handles exactly the feed-less, flyer-only case, which is
what makes Freeze Tag viable.)
