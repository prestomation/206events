---
name: Trivia! Wednesdays at 7:00PM
status: notviable
platform: Unknown
url: https://growlerzseattle.com/events
tags: ["nightlife", "learning"]
firstSeen: 2026-08-25
lastChecked: 2026-09-20
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: growlerzseattle.com.

Sample event: "Trivia! Wednesdays at 7:00PM" (2026-08-27T02:00:00.000Z)
Description: Weekly trivia night at Growlerz Seattle. $2 per person to enter, winning team takes all. Watch weekly update email and social media for clues.

Re-checked 2026-09-16: `https://growlerzseattle.com/events` fails TLS
verification ("unable to get local issuer certificate") — a broken
certificate on the site itself, not a proxy/network issue on this end.
Unreachable from this environment; not stageable. Re-check next cycle in
case the site fixes its cert.

Re-checked 2026-09-20: TLS now works (cert fixed), page loads (200). No
real events calendar found, though: the only calendar-shaped thing on the
page is an Elfsight widget (`elfsight-app-c575d3e5-...`). Queried
Elfsight's own boot API (`core.service.elfsight.com/p/boot/`) directly for
that widget id — it resolves to app type `"popup"` with a
`scheduleStart`/`scheduleEnd` window of 2024-08-14 to 2024-09-02, i.e. a
long-expired promotional popup, not an events list. The "Trivia!
Wednesdays" text is just static copy on the page, not backed by any
structured feed. Marking `notviable` — no machine-readable calendar
exists here for even the single known weekly event.
