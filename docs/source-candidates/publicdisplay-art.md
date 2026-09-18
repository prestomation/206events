---
name: "PublicDisplay.ART"
status: candidate
platform: unknown (custom Next.js app)
url: https://publicdisplay.art/calendar
tags: [Arts, Community]
firstSeen: 2026-08-21
lastChecked: 2026-09-18
---

Self-described "non-profit arts portal connecting Seattle's creative
community with patrons and art lovers" — a citywide aggregator, not a
single venue (sourceRole would be `aggregator`, geo: null). Calendar
page shows 30-60+ events/day across late Aug–Sept 2026: neighborhood
art walks (Chinatown/ID, Queen Anne, Pioneer Square, Ballard, Capitol
Hill, Fremont, Georgetown), gallery exhibitions, music (jazz jams,
symphony), workshops, and theater productions.

Investigated 2026-08-21:
- Site is a Next.js app (`x-powered-by: Next.js`, RSC headers on
  response) — no ICS/iCal export, no documented API found in the
  rendered page.
- `/sitemap.xml` returns the app's not-found page, not a sitemap.
- Given the breadth (many events are individual venues/orgs already
  covered by their own dedicated sources in this repo), this would need
  careful cross-source dedup consideration and is a 🔴 Low-confidence
  custom-scrape candidate at best — likely needs JS rendering
  (browserbase-tier) to extract data, since Next.js RSC payloads aren't
  always present in the plain HTML fetch.

**Recommended next step**: inspect the Network tab for the actual
`/calendar` page (via browser dev tools) to find the underlying data
fetch (RSC flight data or a JSON API) before attempting a scraper. Not
attempted this cycle — flagging as a candidate for a follow-up
investigation session with browser access.

Re-investigated 2026-09-10:
- The follow-up investigation above turned out unnecessary — a plain
  `curl` fetch of `/calendar` (no browser/JS execution) already returns
  the Next.js RSC flight payload (`self.__next_f.push(...)`) inline in
  the initial HTML response, containing ~590 embedded ISO dates,
  including 30+ confirmed dates after today (2026-09-10) running through
  at least mid-October 2026. So plain HTTP fetch is sufficient — no
  browserbase tier needed.
- Titles/venues are still not exposed as clean JSON keys in the flight
  payload (no `"title":`/`"venue":` fields found via simple grep) — the
  data is likely serialized in a more compact/positional RSC format that
  a scraper would need to reverse-engineer further before this is
  actually implementable.
- Given the citywide-aggregator scope (still `sourceRole: aggregator`,
  heavy overlap with venues already covered by their own dedicated
  sources) and the extra parsing work needed to pull structured
  title/date/venue triples out of the RSC blob, this stays a 🔴 Low-tier
  candidate — confirmed technically reachable now, but not yet a
  same-cycle implementation.

Re-investigated 2026-09-18: the 2026-09-10 finding above was a grep
miss, not a real data gap — the calendar's `initialEvents` array uses
`name`/`org` as its field names (not `title`/`venue`), and is otherwise
completely clean JSON: `{id, name, start_date, end_date, event_type,
org: {name, street, city, state_code, zip, lat, lon}, description}`.
Of ~290 total entries, ~156 are recurring neighborhood "Art Walk" tiles
with no real venue (`org: "na"`) — not real dated events, just category
cards — and most of the rest are month-plus-long museum/gallery
*exhibition* date ranges (`start_date`/`end_date` spanning weeks to
years), not single dated happenings; both are a poor fit for this
project's one-event-one-occurrence model. Filtering to single-day
events (`start_date` date === `end_date` date) with a real `org`
narrows it to ~41 future Seattle-area events across ~15 distinct
non-"Art Walk" organizations — real volume, but still citywide (heavy
overlap with Seattle Symphony, SAM, Frye, Town Hall, PNB, Seattle
Theatre Group, etc., which already have their own dedicated sources in
this repo) and the aggregator's own `start_date` carries no clock time
(always midnight) — the real time only exists on each event's own
detail page (`publicdisplay.art/event/{id}`, a second RSC payload with
a clean `hours` field, e.g. "12:00 PM - 1:00 PM"), meaning one extra
fetch per event.

Given that, implementing the *whole* citywide aggregator is still not
a same-cycle pick (dedup review across ~15 orgs, N+1 fetch cost). But
one of those orgs — **Art Love Salon** (`org.id: 462`) and its parent
Conru Foundation (`org.id: 1`), both at 110 Union St — had been stuck
as `investigating` in its own candidate file
(`docs/source-candidates/art-love-salon.md`) because its own site
never exposed a feed. This aggregator turned out to be that feed:
implemented as `sources/art_love_salon/` (see that file for details),
17 events, 0 errors. Also worth noting for
`docs/source-candidates/seattle-bach-festival.md` (an org a dozen+
searches couldn't find any trace of): this aggregator lists a real
"Seattle Bach Festival" org hosting "Cantata Trail Lectures" at Art
Love Salon on 2026-10-17 — a lead for that candidate's next
investigation pass, not itself implemented here (out of scope for this
PR; single-day-only orgs beyond Art Love Salon/Conru weren't verified
for feed stability).
