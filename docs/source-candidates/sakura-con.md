---
name: "Sakura-Con"
status: notviable
platform: recurring YAML (requires manual date override — follows Easter)
url: https://sakuracon.org/
tags: [Community, Arts]
firstSeen: 2026-06-10
lastChecked: 2026-09-23
---
Largest anime convention in the Pacific Northwest, held annually at the Seattle Convention Center over Easter weekend. Organized by ANCEA (Asia Northwest Cultural Education Association).

Investigated 2026-06-10:
- Historical dates: 2024 Mar 29–31, 2025 Apr 18–20, 2026 Apr 3–5, 2027 Mar 25–28
- Traditionally held over Easter weekend (Good Friday/Saturday/Sunday, sometimes Thursday–Sunday)
- Easter is a moveable feast — NOT expressible as "Nth weekday of month" recurring YAML
- No standalone ICS feed found; Eventeny listing for 2027 found but not a machine-readable source
- To implement: would need a manual date update in YAML each year, or a custom approach
- Low priority until a stable machine-readable source or simpler recurring pattern is identified

Checked 2026-09-23: Already covered: Sakura-Con appears in the existing `seattle-convention-center` ripper's Ungerboeck event feed (e.g. "Sakura-Con'26"), which picks it up each year with the correct dates. sakuracon.org has no ICS feed, and the Easter-based date can't be expressed as recurring YAML. No separate source needed.
