---
name: "SouthEast Seattle Senior Center (SESSC)"
status: blocked
platform: WordPress (The Events Calendar / Tribe Events)
url: https://sessc.org/calendar/
tags: [Community]
firstSeen: 2026-07-23
lastChecked: 2026-07-23
---

Senior center in the Rainier Valley/Southeast Seattle area running daily
drop-in classes (exercise, weaving, painting, sewing/quilting) and
community lunches — found while searching "Seattle senior center events
calendar."

Investigated 2026-07-23:
- WordPress site running The Events Calendar (Tribe Events) plugin —
  confirmed via `?post_type=tribe_events` URL structure and native
  "Export .ics file" / "Export Outlook .ics file" / Google/Outlook 365
  subscribe links on the calendar page.
- Page content itself (fetched via an external renderer) shows real,
  dated July 2026 events, which would normally make this a straightforward
  Tribe Events ICS add.
- However, every direct fetch from this environment is blocked: `curl` to
  both `https://sessc.org/calendar/` and the Tribe ICS export endpoints
  (`/events/?ical=1`, `/events/?ical=1&eventDisplay=list`) returns either
  a bare HTTP 403 or a `202` with an `sg-captcha: challenge` response
  header — a SiteGround JS bot-challenge, the same pattern already seen
  on other SiteGround-hosted sources in this repo (`hugo-house`,
  `earshot-jazz`, etc.) that live on the `browserbase` proxy rung.
- Per the "fetch fails locally too" rule, do not implement or stage this
  cycle — a source that can't be reached from anywhere in this
  environment has nothing to prove yet.

Re-evaluate as a normal proxy candidate in a future cycle (the ICS URL
pattern is already known: `sessc.org/events/?ical=1&eventDisplay=list`),
staging it with `proxy: false` + `requires-proxy-testing` once a plain
fetch succeeds, or going straight to `browserbase` given the sgcaptcha
signature matches sources that needed it.
