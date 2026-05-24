---
name: "KeyBank Outdoor Movies at Marymoor Park"
status: added
platform: Custom HTML
url: https://www.epiceap.com/movies-at-marymoor/
tags: [Movies]
firstSeen: 2026-05-24
lastChecked: 2026-05-24
issue: 398
---
Epic Events' summer outdoor movie series at Marymoor Park in Redmond. 8
screenings per summer (2026 series: July 8 – Aug 26), each with food
trucks and pre-movie entertainment.

The page is a WordPress + Avada Fusion Builder site; each movie night is
a `.fusion-panel` accordion with a `.fusion-toggle-heading` like
"Wednesday, July 8th: FERRIS BUELLER'S DAY OFF" and a `.panel-body`
that contains a `Doors Open at: <time>` line and the SimpleTix ticket
link.

Quirks the ripper has to tolerate:
- Headings occasionally omit the space between the month name and the
  day ("July15th" rather than "July 15th").
- One doors-open time on the 2026 page is rendered as `7:00m` (typo for
  `7:00pm`). The ripper treats a bare `m` suffix as `pm`.
- The page never states the year explicitly in the heading; the ripper
  infers it from the current date (use the soonest occurrence that is
  not already in the past).

Filed from #398 (which also bundled "Movies at the Mural" and other
Seattle Center / neighborhood park series). Those secondary candidates
remain unimplemented — see issue #398 for the rest of the list.
