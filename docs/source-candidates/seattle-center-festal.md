---
name: "Seattle Center Festál"
status: added
platform: Custom HTML
url: https://www.seattlecenter.com/events/featured-events/festal
tags: [Community, Arts, QueenAnne]
firstSeen: 2026-05-25
lastChecked: 2026-05-25
---
Series of 25 free multicultural festivals at Seattle Center, running February
through November each year. Each festival celebrates a distinct cultural
community through music, dance, food, and art.

Live fetch on 2026-05-25 confirmed the dedicated page returns all festivals
with title, date, and description in a consistent `h2.fifty-fifty__title` /
`.fifty-fifty__content > b` HTML structure. 16 upcoming festivals for the
remainder of 2026.

Implemented as a custom HTML ripper that parses the featured-events page,
handles same-month and cross-month date ranges, skips postponed entries, and
filters past events. Source added in the PR that resolves the ideas.md entry.
