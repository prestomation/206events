---
name: Seattle Drum School of Music
status: added
platform: "WordPress (Modern Events Calendar plugin) — RSS feed"
url: https://seattledrumschool.com/events/
tags: ["Music", "Georgetown"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr:
---

Discovered via aggregator gap analysis (single one-off event: "Legal Lens
with Jeffrey Izzo, by Seattle Composer's Alliance"). Re-investigated
2026-09-16 as the full source rather than the one event.

**Implemented 2026-09-16:** Same platform/pattern as `sources/nw_dance`
(already `added`, PR #1319) — a WordPress site running the "Modern Events
Calendar" plugin, which auto-registers an RSS feed at `/events/feed/` with
structured `mec:startDate`/`mec:startHour`/`mec:endDate`/`mec:endHour`/
`mec:location` fields per item. Unlike NW Dance's feed (one post per class
series, `startDate`=first occurrence/`endDate`=last), this feed unrolls
each recurring listing into a separate `<item>` per future occurrence (same
guid, different `startDate` — some series repeat out to 2028), so the
ripper (`sources/seattle_drum_school/ripper.ts`) folds the occurrence's own
`startDate` into the event id to keep them distinct.

Two venues appear across the feed: "The LAB@1010 | SDSM Georgetown" (1010 S
Bailey St, Seattle — 48/50 sampled items) and "Hellbent Brewery" (13035
Lake City Way NE, Seattle — an occasional off-site show), mapped to full
addresses via a `KNOWN_VENUES` table for precise geocoding, same pattern as
NW Dance. One recurring listing, a weekly church congregation's rented
worship service, is filtered out before parsing (not a general public
community event). `sourceRole: venue`, fixed `geo: null` (per-event
location field, standard geocoding pipeline), tags `Music`, `Georgetown`.
48 events, 1 non-fatal `ParseError` (a "Wear Your SDSM T-Shirt Day" listing
with no stated location — correctly surfaced rather than silently dropped
per the "parse methods never return null" rule), 0 unresolvable locations,
verified via `ONLY_SOURCE=seattle-drum-school npm run generate-calendars`.
