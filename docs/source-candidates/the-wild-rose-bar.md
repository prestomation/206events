---
name: The Wild Rose Bar
status: added
platform: Wix
url: https://www.thewildrosebar.com
tags: [Nightlife, Queer, "Capitol Hill"]
firstSeen: 2026-08-14
lastChecked: 2026-08-23
pr: pending
---

Capitol Hill lesbian bar hosting regular events, dance nights, and live music.

Real, live site (1021 E Pike St, Capitol Hill), built on Wix. No dedicated
events calendar page — content is a handful of recurring/featured items:
weekly DJ nights (Fri/Sat 9pm-2am), a one-off "Wildrose Day" (Dec 30), and a
multi-day 2026 Pride event (Jun 26-28). Low volume (~3 distinct items) but
real and not already covered. Best modeled as a `sources/recurring/` entry
for the weekly DJ nights plus manual entries for the dated specials, or a
lightweight HTML scrape if the page structure is stable. Not religious.

**Implemented 2026-08-23:** Re-fetched the homepage and confirmed the
weekly cadence is still exactly "DJs every Friday and Saturday from
9pm-2am" with no calendar plugin/API. Added as
`sources/recurring/wild-rose-bar.yaml` (venue: Wildrose, 1021 E Pike St,
Seattle, WA 98122; OSM node 2158750160) with two schedule entries (every
Friday and every Saturday, 21:00 start, PT5H duration). The one-off
"Wildrose Day" and 2026 Pride dates don't fit the recurring pattern
schema and were left out — not enough recurring volume/precision to
justify a separate manual entry; revisit if the venue publishes a real
calendar. `ONLY_SOURCE=wild-rose-bar npm run generate-calendars` confirmed
2 live events.
