---
name: "Northwest Film Forum"
status: added
platform: Custom HTML (WordPress with a custom `nwff/v1` REST namespace; no Tribe Events)
url: https://nwfilmforum.org/calendar/
tags: [Movies, "Capitol Hill"]
firstSeen: 2026-07-02
lastChecked: 2026-07-02
---

**Northwest Film Forum (NWFF)** — `https://nwfilmforum.org/calendar/` — arthouse cinema and film-education nonprofit at 1515 12th Ave, Seattle, WA 98122 (Capitol Hill). Runs daily repertory/indie screenings, film festivals (Local Sightings, Cadence Video Poetry, Free Forum series), and workshops.

Investigated 2026-07-02:
- WordPress (custom theme), no Tribe Events plugin. Standard `wp/v2` REST has no events route, but a custom `nwff/v1` namespace exposes `/wp-json/nwff/v1/html/calendar/day?date=YYYY-MM-DD` — returns `{"html": "<article>...</article>..."}`, an HTML fragment of that single day's programming (film/event/workshop preview cards with `<a href="https://nwfilmforum.org/{films|events|education/workshops}/<slug>/">`)
- The static `/calendar/` page itself only server-renders a ~1-week rolling window (confirmed: only July 2–9 present regardless of query string) — the day-by-day REST endpoint is required to discover the full schedule; looped it over the next 30 days and found **35 distinct upcoming events** (27 `/films/`, 2 `/events/`, 4 `/education/workshops/`; one closure notice "NWFF Summer Break 2026" also surfaces as an "event" card but has no real showtime — see below)
- Per-item detail pages carry Schema.org microdata, but the shape differs by URL prefix:
  - `/films/<slug>/`: clean `<div itemscope itemtype="http://schema.org/Movie">` → nested `ScreeningEvent` with a **valid** `<meta itemprop="startDate" content="2026-07-10T19:00:00">` and a `location` (`MovieTheater`) block with `name`/`address` (own venue: "Northwest Film Forum", "1515 12th Ave, Seattle WA 98122"); title is reliably `<h1 itemprop="name">...</h1>`
  - `/events/<slug>/` and `/education/workshops/<slug>/`: the `itemprop="startDate"` meta is **broken/empty** (`content="T"` — no real date). The real date/time is only in free text, e.g. `Friday, July 22nd, 2026<br />6:30pm doors<br />7:00pm showtime!` inside a `.grid .col-1` block — needs regex parsing, not a clean datetime attribute. `location` block (Place) is present and reliable.
- `geo: null` at ripper level with per-event `location` (name + address) for Nominatim geocoding — covers the common case (their own Capitol Hill venue) and any occasional off-site/festival venue without hardcoding
- `sourceRole: venue` (first-party programmer of its own screenings/events)
- The "NWFF Summer Break 2026" closure notice has no parseable showtime — expect it to correctly fail date extraction and surface as a `ParseError` rather than being guessed at (per the "parse methods never return null" + "no silent defaults" rules); do not synthesize a fake time for it.

Next: implement as a custom `IRipper`:
1. Discovery — loop `date` over roughly the next 60–75 days, calling the `nwff/v1` day endpoint, collecting unique detail-page URLs from the returned HTML fragments (dedupe; a multi-day series can repeat the same URL across several day-fragments).
2. Detail fetch — for each unique URL, extract title (`<h1 itemprop="name">`), date/time (prefer the `ScreeningEvent`/`Event` `startDate` meta when it's a real ISO datetime; otherwise fall back to parsing the free-text date/time block), and location (`Place`/`MovieTheater` itemprop `name`+`address`).
3. Stable id — slug (from the URL path) + ISO date.

## Implemented

Implemented as `sources/northwest_film_forum/ripper.ts` — see git history for the PR.
Quality gate finding: a third-party ICS mirror already existed at
`sources/external/nw-film-forum.yaml` (`https://seattle-movies.innocence.com/nwff.ics`,
tags `Movies`/`Arts`/`Capitol Hill`) but was missed during the initial discovery
pass above (step 4's "check `sources/external/`" was skipped). That feed only
ever covered `/films/` screenings (59 events, no `/events/` or
`/education/workshops/` content, no synopsis/image/cost), and is an unofficial
third-party mirror rather than NWFF's own feed. Since the new first-party
ripper fully supersedes it (all three content types, richer per-event data,
no dependency on a third party staying up), `sources/external/nw-film-forum.yaml`
was set `disabled: true` in the same PR, with `allowed-removals/external-nw-film-forum.ics`
added to permit `external-nw-film-forum.ics` to drop out of the manifest.

Tag corrected from the originally-proposed `Film` to the already-established
`Movies` tag (`lib/config/tags.ts` `TAG_CATEGORIES.Activities`), which is what
every other Seattle cinema source in this repo (AMC, Majestic Bay, SIFF, Three
Dollar Bill Cinema, Grand Illusion, Central Cinema, the old NWFF mirror, ...)
already uses — avoids a semantically-duplicate tag that `detectTagDuplicates`
wouldn't catch (different normalized spelling).

Detail-page notes beyond the original investigation:
- `/education/workshops/` pages use `schema.org/Course` + `CourseInstance`
  (not `Event`), and multi-day camps express their `startDate` as a
  date-only string with a trailing empty time (`"2026-07-27T"`) — still
  correctly rejected by the strict clean-startDate regex. Their free-text
  date is a range (`"July 27-31, 2026"`, no weekday prefix) rather than the
  single-day `"Weekday, Month Dst, YYYY"` pattern `/events/` uses, so it
  falls through to a `ParseError` rather than guessing which single
  day/time to represent — two real camp pages (`camp1-2026`, `camp2-2026`)
  surface this way in the `ONLY_SOURCE` build and that's expected.
- `ONLY_SOURCE=northwest-film-forum` build: 40 events, 3 non-fatal
  `ParseError`s (the "NWFF Summer Break 2026" closure notice + the two
  multi-day camp pages above — all correctly unparseable, not bugs).
