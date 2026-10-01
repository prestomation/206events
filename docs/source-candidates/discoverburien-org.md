---
name: "Discover Burien"
status: added
platform: Squarespace (calendarView collection)
url: https://www.discoverburien.org/calendar
tags: [Community, Burien]
firstSeen: 2026-09-24
lastChecked: 2026-10-01
pr:
---

Burien community/tourism calendar site (`discoverburien.org`), King County.

Investigated 2026-09-24:
- Squarespace confirmed
- `/calendar?format=json` returns `calendarView: true` and a `monthFilter`
  timestamp (defaults to the current month) instead of the usual
  `upcoming`/`past` split — `items: 12` mixes past and future dates within
  that one month (e.g. "B-Town Fiesta" Sep 27 2026, "Burien Farmer's Market"
  Sep 24 2026, "Pride Movie Night" Sep 18 2026, already past)
- The built-in `squarespace` ripper type (`lib/config/squarespace.ts`) only
  reads `upcoming`/`past`/`items` with pagination via `pagination.nextPageUrl`
  — it has no handling for `calendarView`/`monthFilter` collections, so
  pointing the built-in ripper at this URL as-is would need either a
  month-by-month crawl (`?month=<ts>`) or a custom ripper to walk forward
  through months and filter by date
- Not implementable with the existing built-in ripper without that added
  support; not a dead end, just needs either an enhancement to the
  built-in squarespace type (calendarView support) or a small custom
  ripper. Re-evaluate as a 🔴 Low custom-scraper candidate in a future cycle.

Re-checked 2026-09-25: the plain `/calendar?format=json` fetch (no query
params beyond `format=json`) still succeeds and returns the current
month's `calendarView`/`monthFilter` items as before. But any request
adding a `month=<epoch>` param to crawl forward into future months —
tried both `?month=<epoch-ms>&format=json` and `?format=json&month=<epoch-ms>`
— gets served a Squarespace "Please Stand By" bot-challenge page instead
of JSON, even though the identical unparameterized URL keeps working
seconds before/after. A `/calendar/<year>/<month>` path-style URL (in case
this Squarespace config routes month navigation that way) returns the
site's normal non-JSON HTML instead of the calendar collection, so that
alternate URL shape isn't the right one either. Net effect: only the
*current* month's mixed past/future items are reachable from this
environment; there is no way found yet to page forward without triggering
the challenge. Still 🔴 Low / not implementable without either (a) a
`browserbase`-style JS-executing fetch to get past the challenge on
`month=`-parameterized requests, or (b) Squarespace calendarView support
landing in the built-in ripper type with some other pagination approach.
Left as `investigating`.

**Added 2026-10-01:** Took option (b) — the unparameterized `?format=json`
request was already sufficient; no `month=` crawl (and thus no bot
challenge) is needed. `fetchUpcomingEvents` in `lib/config/squarespace.ts`
already had an `items` fallback for non-`upcoming`/`past` collections (used
whenever `upcoming` is absent and non-empty `items` is present), but it
pushed every item through unfiltered — fine for a plain content collection,
wrong for a `calendarView` one where `items` mixes past and future dates.
Fixed it to filter `items` to `startDate > now`, mirroring the existing
`past`-fallback filter immediately below it; this fallback had no test
coverage and no other live source depends on it, so the fix is safe.
Added `sources/discover_burien/ripper.yaml` (`type: squarespace`,
`sourceRole: aggregator`, `geo: null`, tags `Community`/`Burien`). Verified
with `ONLY_SOURCE=discover-burien`: 16 future events (Oct–Nov 2026,
Farmer's Market, Boo-in Burien Trick-or-Treat, Business After-Hours, Burien
Uncorked, Monthly Pride Happy Hour, etc.), 0 errors — the response isn't
strictly bounded to the current calendar month, so no month-crawl is
missed.
