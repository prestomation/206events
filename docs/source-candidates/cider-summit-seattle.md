---
name: "Cider Summit Seattle"
status: notviable
platform: Squarespace (static pages)
url: https://www.cidersummitnw.com/seattle1
tags: [Beer, Community, "South Lake Union"]
firstSeen: 2026-06-11
lastChecked: 2026-06-11
---
**Cider Summit Seattle** — `https://www.cidersummitnw.com/seattle1` — Annual cider festival at South Lake Union Discovery Center Lawn, September 11-12, 2026.

Investigated 2026-06-11:
- Squarespace site confirmed, but uses static page content (collection type: page), not an events collection
- `?format=json` shows no events array — dates and details are hardcoded HTML text blocks
- No events collection to scrape; the Squarespace ripper requires a proper events-stacked collection
- Organization covers Seattle, Portland, and Chicago cities — not Seattle-exclusive
- Annual one-day festival with no feed available

**Verdict**: Not viable — static Squarespace page with no events collection. Would need a recurring YAML entry instead, but the 2-day September dates vary year to year (the "4th Saturday-Sunday of August" or similar pattern is unclear). Re-evaluate if they add an events collection.
