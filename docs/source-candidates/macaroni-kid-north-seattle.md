---
name: "Macaroni KID North Seattle-Shoreline"
status: notviable
platform: "Unknown custom (Macaroni Kid national franchise CMS)"
url: https://nwseattle.macaronikid.com/events
tags: [Family]
firstSeen: 2026-08-17
lastChecked: 2026-09-23
pr:
---

Local franchise edition of the national Macaroni Kid family-events network,
covering North Seattle and Shoreline.

Investigated 2026-08-17:
- `/events` returns HTTP 200 but `?format=json` returns the same HTML page
  (not a Squarespace/JSON-backed collection) — custom Macaroni Kid platform.
- No obvious API endpoint found on a quick pass (no `api.*events*` URLs in
  the page source).
- 🔴 Low confidence — would need `HTMLRipper` scraping and a look at the
  actual event volume/dates before committing to implementation. Also
  straddles North Seattle/Shoreline — would need per-event filtering to stay
  Seattle-focused if Shoreline-only listings turn out to be common. Leaving
  as `candidate` for a follow-up look.

**Re-checked 2026-09-23 (notviable):** The `/events` page embeds a Yodel widget (`events.yodel.today/y/widget/69cd3fa1b9fe80e015e338a4`, a JS-rendered Next.js app). Its ~24 listed events are pulled from other calendars (e.g. "spl event calendar" story times, which the `spl` source already covers), and many are outside Seattle (Carnation, Shoreline, Lake Forest Park, Kenmore). It's an aggregator of aggregators with little original Seattle content. Closing as notviable.
