---
name: League of Women Voters King County
status: notviable
platform: ClubExpress
url: https://www.lwvskc.org/content.aspx?page_id=
tags: [Political]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr:
---

League of Women Voters King County chapter events, voter education, and civic engagement activities.

**Findings (2026-08-14):** Live, active site (footer: "Powered by ClubExpress" — common
nonprofit membership platform). The generic `content.aspx?page_id=` URL in the candidate
frontmatter isn't the actual event calendar; a real "Event Calendar" page exists at
`content.aspx?page_id=22&club_id=711832` with per-event `module_id` params, so this needs a
corrected URL before implementation. Not a religious org. Should confirm event volume by
loading `page_id=22` directly (had multiple `module_id` values suggesting several
listed events/modules) — no ICS export confirmed yet.

Re-checked 2026-09-16: `lwvskc.org/` (and the `page_id=22` calendar URL) returns
HTTP 403 from this environment. Per the "blocked here, don't implement" rule,
not stageable — leaving as `candidate` rather than `blocked` in case it's an
intermittent WAF rule; re-test with a plain fetch next cycle.

**Re-checked 2026-09-23 (notviable):** Re-checked: the site returns 403 to the 206events UA but 200 to a normal browser UA (AWS ALB). The real calendar is `content.aspx?page_id=4001&club_id=711832` (ClubExpress month grid). In September 2026 almost every entry is an internal unit or committee meeting (Voter Services Committee, West Seattle Unit, New Member Orientation, Economics & Taxation Committee, ...), with about one public forum a month ("How Your Vote Counts"). There's no ICS export, so it would need a custom ASP.NET/ClubExpress scraper for about one public event a month. Closing as notviable.
