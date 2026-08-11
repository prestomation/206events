---
name: KNKX Events
status: candidate
platform: NPR PSD (Drupal / Custom HTML)
url: https://www.knkx.org/events
tags: [Music, Tacoma, Seattle]
firstSeen: 2026-08-11
lastChecked: 2026-08-11
---

Discovered via r/SeattleEvents post: https://old.reddit.com/r/SeattleEvents/comments/1vkolx8/knkx_10th_anniversary_event_in_tacoma_811/
Post title: "KNKX 10th Anniversary Event in Tacoma 8/11"
Post date: 2026-08-10

KNKX (88.5 FM, Tacoma / 91.3 Seattle) is a public radio station that hosts
in-person and live-streaming events across the Seattle and Tacoma area. The
discovered URL was a single one-off event page for the "KNKX 10th Anniversary
Event in Tacoma" (8/11), but KNKX maintains a dedicated, recurring events
calendar at `https://www.knkx.org/events` listing upcoming in-person and live
events — the real source, not the individual anniversary event.

This is the first time the KNKX *events calendar* has surfaced via discovery.
Prior KNKX mentions (2026-07-19, 2026-07-25 discovery logs) were for the jazz
venues guide article (`/bars-venue-live-music-jazz-seattle`), which was
correctly skipped as a content site — that is a different page and remains
not-viable. The events calendar is analogous to KEXP (`sources/kexp/`), which
is already implemented as a custom HTML ripper.

Platform: NPR PSD (Publishing Services for Digital), Drupal-based (`SectionPage`
HTML class, `application/ld+json` structured data). The events page intro is
server-rendered but the event list items appear to be loaded dynamically via the
PSD API, so scraping will require finding the JSON/API endpoint or parsing the
individual event pages. Needs investigation into the PSD events data source
before it can be implemented (mirror the KEXP approach).
