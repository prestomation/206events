---
name: "SODO Business Improvement Area (SODO BIA)"
status: candidate
platform: WordPress / The Events Calendar (Tribe Events) — ICS export
url: https://sodoseattle.org/events/
tags: [Community, "SoDo"]
firstSeen: 2026-08-04
lastChecked: 2026-08-04
---

SODO's business improvement area organization (5 x N Corp / SODO BIA),
office at roughly 1st Ave S / SODO. Runs an events calendar of
neighborhood community meetings and public gatherings.

Investigated 2026-08-04:
- `https://sodoseattle.org/events/` initially 403'd on a plain `curl -I`
  with a generic UA from this environment, but returned 200 with a
  browser-style UA (`Mozilla/5.0 ... Chrome/125...`) — likely a WAF rule
  on UA string, not a hard IP block. Worth re-testing with the project's
  standard `curl -A "Mozilla/5.0 (compatible; 206events/1.0)"` header
  before assuming it needs a proxy.
- Confirmed WordPress + The Events Calendar (Tribe) plugin
  (`wp-content/plugins/the-events-calendar`), page showed "42 events
  found" in the on-page month view for August 2026.
- ICS export confirmed working:
  `https://sodoseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list`
  returns a valid `VCALENDAR` with 19 `VEVENT`s at time of check, dated
  Aug 2026 – Nov 2028 (some far-future placeholder entries, e.g. "Office
  Closed - Thanksgiving" dated 2028).
- Event mix: recurring "Transportation & Infrastructure Community
  Meeting", "Engagement and Development Community Meeting", "Clean &
  Safe Community Meeting" (monthly-ish), plus "National Night Out",
  "Coffee Hour", and "Q4 Business Networking Event".
- The narrower `/events/?ical=1` (no `post_type`/`eventDisplay` params)
  only returned 5 events — use the full `?post_type=tribe_events&ical=1&eventDisplay=list`
  URL (also the one advertised in the page's own "Subscribe to calendar"
  webcal links) to get the full list.
- Content skews toward internal BIA community/business meetings rather
  than public-facing events, similar in character to already-added
  chamber/BIA sources (e.g. `gba-georgetown`). Borderline on "event
  volume" appeal but the feed is real and forward-looking; leaving as a
  candidate rather than pre-judging fit.
- `geo`: office address not confirmed precisely from this pass — the ICS
  feed's events likely occur at the BIA office (SODO). Recommend
  resolving address via the site's Contact page before implementing, or
  using `geo: null` if events don't consistently list one location.

Re-checked 2026-08-05: both `sodoseattle.org/?post_type=tribe_events&ical=1&eventDisplay=list`
and the plain `/events/` page now return HTTP 202 with an `sg-captcha:
challenge` response header (SiteGround JS challenge) and an empty body,
even with a browser-style UA/Accept headers — this is the JS-challenge
pattern the proxy docs call out as needing the `browserbase` rung, not
`outofband`. Deprioritized this cycle in favor of the higher-confidence,
no-fetch-risk West Seattle Junction Harvest Fest candidate (recurring
YAML, PR pending). Re-check with a plain fetch next cycle before staging
for proxy testing — the block may be intermittent (it returned clean 200s
with 19 VEVENTs on 2026-08-04).
