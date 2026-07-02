---
name: "The Admiral Pub"
status: added
platform: recurring YAML
url: https://admiralpubseattle.com/trivia-night-seattle
tags: [Trivia, "West Seattle"]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
pr: 808
---

**The Admiral Pub** — `https://admiralpubseattle.com/trivia-night-seattle` — West Seattle sports bar in the Admiral District, 2306 California Ave SW. Hosts free pub trivia three nights a week with cash prizes.

Investigated 2026-07-02:
- Site is a static GoDaddy Website Builder page (`meta name="generator"` confirms) with no structured event feed — not viable as a scraped ripper, but the schedule is a stable weekly pattern, so implemented as `sources/recurring/admiral-pub-trivia.yaml`.
- Schedule confirmed via the pub's own blog post ("Best Trivia Nights in Seattle (2026 Guide)"): every Tuesday, Wednesday, and Thursday at 7:00 PM, except the last Thursday of the month (pinball tournament instead). Free to play; $50/$30 cash prizes for 1st/2nd place.
- Address (2306 California Ave, Seattle, WA 98116) geocoded via Nominatim: 47.5826988, -122.3862243 (osm node 2445204016).
- The "except last Thursday" exception isn't encodable in the recurring schedule format (no day-of-month exclusion), so an occasional false-positive Thursday occurrence is expected — same accepted tradeoff as `chasm-capitol-hill-swap-meet.yaml`.
