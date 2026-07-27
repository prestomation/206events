---
name: "Cider Summit Seattle"
status: added
platform: Recurring YAML (hand-coded, no scrapable feed)
url: https://www.cidersummitnw.com/seattle1
tags: [Beer, Community, "South Lake Union"]
firstSeen: 2026-06-11
lastChecked: 2026-07-27
pr: 1028
---
**Cider Summit Seattle** — `https://www.cidersummitnw.com/seattle1` — Annual cider festival at South Lake Union Discovery Center Lawn.

Investigated 2026-06-11:
- Squarespace site confirmed, but uses static page content (collection type: page), not an events collection
- `?format=json` shows no events array — dates and details are hardcoded HTML text blocks
- No events collection to scrape; the Squarespace ripper requires a proper events-stacked collection
- Organization covers Seattle, Portland, and Chicago cities — not Seattle-exclusive
- Annual one-day festival with no feed available

Re-investigated 2026-07-27:
- Confirmed no scrapable feed still exists (static page), but the day-of-week
  pattern is stable enough for a recurring YAML entry: 2024 = Sep 6-7 (1st
  Fri/Sat), 2025 = Sep 12-13 (2nd Fri/Sat), 2026 = Sep 11-12 (2nd Fri/Sat, live
  page confirmed via curl on 2026-07-27)
- Added `sources/recurring/cider-summit-seattle.yaml` using `"2nd Friday"` /
  `"2nd Saturday"`, `months: [9]` — same pattern as `bite-of-seattle.yaml` and
  `bumbershoot.yaml` for other date-shifting annual festivals
- Venue geocoded via Nominatim: 101 Westlake Ave N (South Lake Union Discovery
  Center), `osmType: way`, `osmId: 231664565`
- Cost: $35 (General Admission advance price; cheapest adult ticket, fees
  excluded per pricing rubric)
- No usable venue photo found on a quick pass — left `imageUrl` unset; will
  surface in the `photoGaps` queue for the photo-resolver skill

**Verdict**: Added as a recurring event. Local `ONLY_SOURCE=cider-summit-seattle npm run generate-calendars` produced 2 events (Fri Sep 11 2026 3pm, Sat Sep 12 2026 12pm) with 0 errors. Re-verify the day-of-month pattern each year before the festival — see comment in the YAML file.
