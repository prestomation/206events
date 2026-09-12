---
name: Columbia City Seattle Calendar
status: added
platform: Wild Apricot
url: https://columbiacityseattle.com/calendar
tags: [Community, Columbia City]
firstSeen: 2026-08-14
lastChecked: 2026-09-12
pr: 1452
---

Columbia City neighborhood community calendar with local events and activities.

**Checked 2026-08-14:** Confirmed live — Columbia City Business
Association calendar, powered by **Wild Apricot** ("Powered by Wild
Apricot Membership Software" in footer). Real dated events: SEEDArts
"98118 Festival" (Aug 22), Unwavering Hope Artists' Reception (Aug 27),
CCBA Membership Meetings (Sep 22, Nov 24). Community event submissions
accepted (14-day advance notice). Columbia City is a Seattle
neighborhood — Seattle-focused. Wild Apricot typically exposes an
iCal/RSS export on its public calendar widget; worth checking for a
feed URL when implementing.

Re-checked 2026-09-03: the `/calendar` page's "UPCOMING EVENTS" side
widget IS static/server-rendered (no JS needed — plain `curl` shows
`<li>` entries with title/date/location), but it currently lists only 2
events, both "CCBA Membership Meeting" (internal board meetings, Sep 22 +
Nov 24). The main React-driven month-grid calendar widget
(`live-sf.wildapricot.org/.../index-*.js`) is where the richer public
events (art receptions, festivals) likely live, but its data-fetching API
endpoint wasn't identified from a plain fetch (tried several guessed WA
REST paths — `api/mac/v1/publicevents/events`, `Sys/PublicEvents/Events`
— all 404). No official Wild Apricot ICS/RSS export link found on the
page either. Same character concern as `sodo-bia.md`: the reliably-
scrapable content skews toward internal business-association meetings
rather than public-facing events. Leaving as `candidate` rather than
`notviable` — worth a closer look at the WA widget's actual API calls
(browser network tab) if this becomes a priority, since the org clearly
does publish genuine public events.

Implemented 2026-09-12: added as `sources/columbia_city_business_association/`
(custom HTML ripper, `sourceRole: aggregator`, `geo: null`). The listing now
has 3 upcoming events — 2 CCBA Membership Meetings plus a genuinely
public-facing "Sound Transit Safety Fair" — confirming the earlier note that
real public events do appear here, not just internal meetings.

Deliberately does **not** follow each event's link to its detail page for a
richer description/end-time, even though the detail pages carry a nice
inline JS data blob with exact start/end timestamps (a first implementation
attempt used that approach). Wild Apricot rate-limits this host hard: a
detail-page request succeeds only when it's the first request from an IP in
some cooldown window (observed to be longer than 20s, possibly much longer)
— a second request moments later reliably gets HTTP 429, reproduced with
both `curl` and Node's `fetch`, with and without spacing/backoff. Fetching
just the single `/calendar` listing page (which already server-renders
title, formatted start time, and location per event) avoids the multi-request
pattern entirely and is what actually survived a real `ONLY_SOURCE` build.
Trade-off: no per-event description, and duration is unknown (flagged as an
`UncertaintyError`, defaulted to 60 minutes) since the listing has no end
time.
