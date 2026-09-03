---
name: Pony Seattle
status: added
platform: recurring YAML (static HTML page, no ICS/API)
url: https://www.ponyseattle.com
tags: [Nightlife, Capitol Hill, LGBTQ]
firstSeen: 2026-08-14
lastChecked: 2026-09-03
pr: 1360
---

Capitol Hill gay bar known for dance parties and DJ nights. Events listed on their homepage.

**Findings (2026-08-14):** Live, real bar (1221 E Madison St, Capitol Hill). Site is a
simple custom/static HTML page, not a commercial platform — no Squarespace/Wix widgets
detected. Events are listed as **recurring named nights** ("BOOTS N' CATS" 1st Thursdays,
"QUEEN4QUEEN" 2nd Fridays, etc.) rather than dated one-off events, with the site itself
pointing to Instagram (@ponyseattle) for specific/one-off DJ nights. Best modeled as a
`sources/recurring/` entry with fixed weekly/monthly patterns rather than a live scrape;
Instagram would be needed for one-off specials (handled by the `instagram-source` skill if
desired later).

**Implemented 2026-09-03:** Re-fetched the homepage — it's a static, non-JS
page with the full recurring-nights schedule server-rendered as plain text
(confirmed via plain `curl`, no browser needed). Nine of the eleven listed
nights state an explicit start time and were implemented as **nine separate**
`sources/recurring/pony-seattle-*.yaml` files (one per distinctly-named
night, following the `dreamland-dream-girls-drag-brunch-{early,late}`
pattern, since each night has its own `friendlyname`/`description` rather
than sharing one across multiple `schedules` entries):

- Tiny Tea Dance — every Sunday 4-9pm
- Pony-oke (karaoke) — every Tuesday 9pm
- Boots N' Cats — 1st Thursday 9pm
- Beefcake — 1st Friday 9pm
- Queen4Queen (drag takeover) — 2nd Friday 9pm
- Nite Terror — 3rd Friday 9pm
- Different Drummer — 4th Friday 9pm
- Audiodrome — 2nd Saturday 9pm
- Musicbox — 3rd Saturday 9pm-2am (only one with an explicit end time)

All nine use `duration: PT5H` (9pm to the bar's posted 2am closing time,
per the site's own posted hours — not a per-event guess). Two nights with
**no stated time at all** ("Bump in the Night", last Wednesdays; "ourHOUSE",
4th Saturdays) were left out rather than guessed, following the
`seattle-frontrunners.md` precedent of omitting schedules the source
doesn't state a time for. A twelfth night ("1st Saturdays... Dr Tony") is
present in the page's raw HTML but wrapped in an HTML comment
(`<!-- did this get removed? -->`) — treated as discontinued and skipped.

Address (1221 E Madison St, Seattle, WA 98122) confirmed via Nominatim
(OSM way 295329823, tagged `amenity=bar`, name "Pony"). All nine events are
free (No Cover). Verified locally with `ONLY_SOURCE=` set to all nine recurring names — 9
recurring calendars, 0 errors, correct RRULE dates (e.g. Queen4Queen's
2nd-Friday RRULE resolves to Sept 11, 2026).
