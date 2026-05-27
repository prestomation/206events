---
name: "Seattle Public Library — Authors & Books"
status: added
platform: Trumba (same as existing SPL ripper)
url: https://www.spl.org/programs-and-services/authors-and-books/authors-and-books-calendar
tags: [Books, Education]
firstSeen: 2026-05-27
lastChecked: 2026-05-27
pr: TBD
---
**SPL Authors & Books** — Trumba `filterview=ProgramAuthorsBooks` — 45+ upcoming events

Cross-branch calendar aggregating author talks, book clubs, poetry readings, zine workshops, and
literary events across all SPL branches. Uses the same `kalendaro` Trumba API as the existing SPL
branch ripper but with `filterview=ProgramAuthorsBooks`.

Investigated 2026-05-27:
- Trumba `webName: "kalendaro"` + `filterview: "ProgramAuthorsBooks"` confirmed from page source
- API endpoint: `https://www.trumba.com/calendars/kalendaro.json?filterview=ProgramAuthorsBooks`
- JSON API returns 45 upcoming events (52-week window)
- Sample events: One Book One Coast author discussions, ZAPP Zine Collection hours, author talks,
  book clubs, poetry readings, Low Vision Book Club, etc.
- ICS export returns 200 with empty body (not usable)
- Implemented as new `sources/spl_authors_books/` ripper reusing `parseTrumbaEvent` from SPL ripper
- `geo: null` (events at multiple branches and non-library locations)
- Tags: Books, Education
