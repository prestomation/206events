---
name: "Stir Up The Paint"
status: blocked
platform: ICS (WordPress / The Events Calendar)
url: https://wa.stirupthepaint.com/events/
tags: [Arts]
firstSeen: 2026-09-12
lastChecked: 2026-09-12
pr:
---

Traveling paint-and-sip class business ("Stir Up The Paint") hosting
in-person guided painting nights at bars, breweries, and event spaces
around the Seattle area — Elysian Brewing Capitol Hill, Alki Arts West
Seattle, Pub 70 (Alaskan Way), and Tapster South Lake Union, plus a
minority of dates in Bellevue (Tapster Bellevue, Forum Social House).

Investigated 2026-09-12:
- WordPress site using The Events Calendar (Tribe Events) plugin
  (`tribe_events` post type, `wp-json`/`the-events-calendar` asset paths
  present in the page markup).
- ICS export URL: `https://wa.stirupthepaint.com/events/?ical=1`. First
  couple of fetches returned a valid VCALENDAR (30 VEVENTs; 17 in Seattle
  proper — Capitol Hill, West Seattle, South Lake Union, downtown
  waterfront — vs. 12 in Bellevue, matching the "Seattle Uncorked with
  some Eastside events" acceptable-minority pattern from AGENTS.md).
- However, repeated fetches (both `curl` and Node's `fetch`, with and
  without a browser User-Agent) started reliably returning an HTTP 200
  page titled "Bot Verification" (a LiteSpeed/LSCache CAPTCHA challenge)
  instead of the ICS body — `ical.js` then fails to parse it
  (`invalid line ... "<!DOCTYPE html>"`), producing 0 events. Six
  consecutive attempts after the first couple of successes all hit the
  challenge page. This looks like a per-IP/session request-volume
  trigger rather than a one-off flake — a plain fetch from this
  environment can no longer reliably reach the feed.
- Per the "fetch fails locally too → do not implement, do not stage"
  rule: not staged for proxy testing (the challenge triggering on plain
  repeated fetches suggests `outofband`/`browserbase` would hit the same
  wall, and this isn't a CI-only IP-block situation to hand off to
  proxy-escalation). Re-check in a future cycle in case the bot-challenge
  threshold or LiteSpeed config changes; not already covered elsewhere in
  `sources/` or `sources/external/`.
