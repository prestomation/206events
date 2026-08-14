---
name: Tech Meetups Seattle
status: investigating
platform: Custom HTML (meetup aggregator)
url: https://techmeetups.io/seattle
tags: [Tech]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Aggregated listing of technology meetups and tech community events in Seattle.

Real, live third-party aggregator site (claims "46 upcoming tech events in
Seattle, 10 in person" from 29 meetup groups). Two WebFetch passes only
surfaced 3 concrete dated events on the page itself (e.g. "1 Hour Hackathon +
Presentations", Sun Aug 16, 2026); the rest appear to require following
per-group links out to Meetup.com/Luma rather than living in a single
scrapable listing on this page, and no pagination/API/RSS/ICS was found.
Not religious, Seattle-focused, not already covered by an existing source.
Marked investigating rather than candidate because it's unclear whether the
full event set is actually scrapable from this page or requires crawling many
external Meetup.com/Luma pages (which are themselves better covered directly
per-group, per this project's usual pattern e.g. `sources/new_tech_seattle`).
