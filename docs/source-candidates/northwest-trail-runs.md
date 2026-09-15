---
name: "Northwest Trail Runs"
status: added
platform: WordPress (Mergeo theme, Y-Designs)
url: https://nwtrailruns.com/events/
tags: [Running, Outdoors]
firstSeen: 2026-06-10
lastChecked: 2026-09-15
pr:
---
**Northwest Trail Runs** — `https://nwtrailruns.com/events/` — Washington State trail running events organization with many Seattle-area races.

Investigated 2026-06-10:
- WordPress site (Mergeo theme by Y-Designs), no Tribe Events plugin
- No ICS/iCal feed found; no REST API for events
- Calendar page at `/calendar/` shows a static HTML table with upcoming events
- Event registration via WebScorer and RunSignUp (not via the WordPress site)
- Multiple upcoming Seattle-area races confirmed:
  - Woodland Park Zoom — June 9, Seattle (5k & 10k)
  - Carkeek Warmer — June 23, Seattle (5k & 10k)
  - Seward Sizzler — July 7, Seattle (4.2mi & 10k)
  - Interlaken Ice Cream Dash — August 4, Seattle (5k & 10k)
  - Plus Cougar Mountain series (Newcastle, nearby) and others
- Many Seattle proper races (Woodland Park, Carkeek, Seward Park, Interlaken) — qualifies as Seattle-focused

Implementation path: Custom HTML scraper for the WordPress events table. Moderate effort (🔴 Low confidence tier — custom scraper needed). No ICS or API available.

Geo: `null` — itinerant events at different parks each race.

Probe 2026-06-12: `/calendar/` returns HTTP 415; `/events/` returns a
Cloudflare "One moment, please..." challenge page. Both blocked in the
Claude Code web environment. Status: blocked.

Re-investigated 2026-09-15: `/events/` and individual `/events/<slug>/`
detail pages are now reachable (200, plain server-rendered HTML, no
Cloudflare challenge) — the June block appears to have been transient.
The `/events/` index lists the org's current season; each event's own
detail page additionally prints the *entire* upcoming series schedule as
plain text (name, date, distances, city), which is how the current
Seattle-proper lineup was confirmed without needing pagination:

- **2026-27 Winter Trail Series**: Carkeek Cooler (Nov 7, Carkeek Park),
  Ravenna Refresher (Nov 21, Ravenna Park), Redmond Reindeer Romp (Dec 5,
  Redmond — excluded), Seward Solstice (Dec 19, Seward Park), Absolution
  Run (Jan 3, Kenmore — excluded), Frost Eagle (Jan 16, Sammamish —
  excluded), Interlaken Icicle Dash (Jan 30, Interlaken Park).

4 of the 7 series races are Seattle-proper (Carkeek, Ravenna, Seward,
Interlaken); the rest are in Redmond/Kenmore/Sammamish and intentionally
left out per the Seattle-focus rule. Each event detail page has a
reliable, consistent structure: a `.date` div with `MM/DD/YYYY`, and a
`.the-content` block whose headings (tag level h1-h4 varies per page, but
order is fixed) give the distance, date, start time ("9:30am" style), and
location ("Carkeek Park, Seattle, WA") before the first descriptive
paragraph. No ICS/JSON API — implemented as a custom `IRipper`
(`sources/northwest_trail_runs/`) with a hand-maintained `eventSlugs`
allow-list (the org's page permalinks are stable/reused year over year,
same assumption as `sources/orca_running`'s `raceIds`), fetching each
event's own detail page directly rather than parsing the paginated
`/events/` index. 4 upcoming events, 0 parse errors, verified via
`ONLY_SOURCE=northwest-trail-runs npm run generate-calendars`. Geocoding
confirmed accurate coordinates for all 4 parks (2 known-venue, 2 live
Nominatim).
