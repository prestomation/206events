---
name: "Acorn Street Shop"
status: notviable
platform: Rain POS (unclear/no accessible calendar data)
url: https://www.acornstreet.com/view-classes-calendar.htm
tags: []
firstSeen: 2026-08-12
lastChecked: 2026-08-12
---

Yarn shop at 2818 NE 55th St, Seattle (Ravenna/View Ridge), offering
knitting/crochet classes and events.

Investigated 2026-08-12:
- Site assets are served from `rainpos.com` (Rain Retail POS platform);
  no ICS, RSS, or public API found for the classes calendar
- Page returns static HTML but the actual class schedule appears to load
  via a Rain POS widget with no confirmed server-rendered date data in
  the fetched markup

**Verdict**: Not viable at this time — no accessible structured calendar
data found. Re-check if Rain POS exposes a public feed in the future.
