---
name: "Dance Underground"
status: added
firstSeen: 2026-06-10
lastChecked: 2026-06-10
tags: [Dance, Capitol Hill]
---
**Dance Underground** — `https://www.dance-underground.com/` — Argentine tango venue at 340 15th Ave E, Capitol Hill, offering Thursday Night Practica ($10) and Saturday Night Milonga ($15-20) weekly.

Investigated 2026-06-10:
- Squarespace site confirmed (squarespace-cdn.com image URLs)
- No Squarespace events collection — recurring socials are listed on a class schedule page, not a structured events calendar
- Events are fixed weekly schedule: Thursday practica 9:15 PM, Saturday milonga 8:30 PM
- Implementation path: `sources/recurring/` YAML entries (one file, two schedules) — simpler than a ripper
- 200 OK accessible

Next steps: Implement as recurring YAML with two schedule entries (Thursday practica, Saturday milonga).
