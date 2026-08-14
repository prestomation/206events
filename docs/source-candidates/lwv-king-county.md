---
name: League of Women Voters King County
status: candidate
platform: ClubExpress
url: https://www.lwvskc.org/content.aspx?page_id=
tags: [Political]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

League of Women Voters King County chapter events, voter education, and civic engagement activities.

**Findings (2026-08-14):** Live, active site (footer: "Powered by ClubExpress" — common
nonprofit membership platform). The generic `content.aspx?page_id=` URL in the candidate
frontmatter isn't the actual event calendar; a real "Event Calendar" page exists at
`content.aspx?page_id=22&club_id=711832` with per-event `module_id` params, so this needs a
corrected URL before implementation. Not a religious org. Should confirm event volume by
loading `page_id=22` directly (had multiple `module_id` values suggesting several
listed events/modules) — no ICS export confirmed yet.
