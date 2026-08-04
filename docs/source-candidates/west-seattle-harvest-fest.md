---
name: "West Seattle Junction Harvest Fest"
status: candidate
platform: none (static page — recurring-YAML candidate)
url: https://wsjunction.org/harvest-fest/
tags: [Community, "West Seattle"]
firstSeen: 2026-08-04
lastChecked: 2026-08-04
---

Annual family-friendly street festival in The Junction — costume parade,
live music, pie-eating contest, chili cook-off. Organized by the West
Seattle Junction Association (same org behind the already-`notviable`
West Seattle Summer Fest, `docs/source-candidates/west-seattle-summer-fest.md`).

Investigated 2026-08-04 (found via the Association's `/event-directory/`
page, which lists ~8 named annual events with no ICS/API — same static
pattern already confirmed for Summer Fest):

- No structured feed on `wsjunction.org` (confirmed: page is plain
  WordPress content, only generic post/comment RSS feeds present, no
  Tribe Events or other calendar plugin).
- Unlike Summer Fest, Harvest Fest's date **is** a clean, verified
  recurring pattern — **last Sunday in October**, 11am–2pm:
  - 2024: Sunday, Oct 27
  - 2025: Sunday, Oct 26
  - 2026: Sunday, Oct 25 (per current site copy)
  - 3 consecutive years, no drift — same confidence bar used for
    `sources/recurring/cid-night-market.yaml` (4th Saturday pattern).
- Good fit for a `sources/recurring/west-seattle-harvest-fest.yaml` entry
  (`schedule: "last Sunday"`, `months: [10]`, `start_time: "11:00"`,
  `duration: PT3H`) rather than a ripper — same treatment as other
  single-annual community festivals already in `sources/recurring/`.
- Location: The Junction, West Seattle — needs a specific `geo` (event
  spans multiple blocks; check whether a fixed anchor point, e.g. the
  Junction Plaza Park or California Ave SW/Alaska St, is appropriate).
- Not yet implemented — flagging for next discovery cycle to add as a
  recurring source.
