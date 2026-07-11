---
name: Freeze Tag Events
status: notviable
platform: TicketSpice (individual per-event pages, no organizer index)
url: https://freezetag.ticketspice.com/
tags: [Community]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
pr:
---

Surfaced from a poster lookup for "Little Treat Tasting & Treasure Tour"
(U-District, 7/19/2026, 11am). Freeze Tag is a real, active, recurring
Seattle experiential-events company — pop-up choirs, scavenger hunts,
murder mysteries, trivia, bingo, neighborhood tasting/treasure tours —
not a one-off. Presence: Instagram/TikTok `@freeze.tag.events`, a
linktree-style hub at `bio.link/tag_freeze`, and a Discord.

Ticketing is **TicketSpice** (`freezetag.ticketspice.com/<slug>`), one
static-ish HTML page per event (e.g. `/little-treat`, `/taskmaster-seattle`,
`/plant-bingo`). Each page is individually parseable, but there is **no
organizer index/listing URL** — `freezetag.ticketspice.com` (bare root)
404s, and no ICS/API endpoint was found. New event slugs are announced
only via Instagram, the newsletter (Google Form signup), or Discord —
there is no crawlable entry point a ripper could use to discover new
events on its own.

**Verdict: not viable as an automated source today.** Nothing to scrape
that stays current without a human manually re-adding new event slugs
each time one is announced, which defeats the point of a ripper. Revisit
if Freeze Tag ever exposes a public "all events" page, an Eventbrite/DICE
migration, or an ICS feed. Some individual formats (e.g. Plant Bingo,
"every 3rd Thursday") have a fixed enough cadence that a hand-maintained
`sources/recurring/` entry could work if someone wants that specific
series covered — but "Little Treat Tasting & Treasure Tour" itself does
not appear to run on a fixed schedule.
