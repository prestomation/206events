---
name: GenPride Center
status: added
platform: WordPress (calendar content not scrapable; implemented as sources/recurring/ instead)
url: https://genprideseattle.org/programs/
tags: ["Community", "Queer", "First Hill"]
firstSeen: 2026-08-25
lastChecked: 2026-09-22
pr: 1564
---

Discovered via aggregator gap analysis. 2 events in the Seattle
metro sample. Source domain: genprideseattle.org.

Sample event: "Hot Lunch" (2026-08-25T19:00:00.000Z)
Description: Weekly hot lunch for LGBTQ+ seniors and friends at GenPride Center. Doors open at 10am. $5 donation for 60+, $10 for under 60.

**Investigated 2026-09-22:** GenPride is a Seattle-based nonprofit (not a
religious organization) supporting LGBTQ+ older adults, operating a fixed
physical location — the GenPride Center, 1521 Broadway, Suite A, Seattle, WA
98122 (First Hill). `/community-calendar/`'s event content is not present in
the static HTML (no ICS export, no `The Events Calendar`/Tribe plugin, no
JSON endpoint found — likely a JS-rendered widget), so the WordPress site
itself isn't a viable ripper target. However `/programs/` and `/hot-lunch/`
list a full slate of the center's regular in-person programs as plain,
server-rendered text with explicit day-of-week + time schedules, verified
directly against the raw HTML (not just a summarized fetch) — a clean fit
for `sources/recurring/`, one file per program (same pattern as
`blue-highway-games-*`).

Implemented as 8 recurring-calendar entries, all `sourceRole: venue`,
geocoded to 1521 Broadway (Nominatim `osmType: way`, `osmId: 808907363`),
tags `Community`, `Queer`, `First Hill`:
- `genpride-hot-lunch` — every Tuesday & Thursday, 12:00–1:00 PM
- `genpride-seasoned-together` — last Monday of the month, 11:30 AM–12:30 PM
- `genpride-senior-trans-support-group` — 2nd & 4th Wednesday, 1:00–2:30 PM
- `genpride-elders-meet-and-greet` — 1st & 3rd Wednesday, 2:00–3:30 PM
- `genpride-senior-mens-support-group` — 2nd & 4th Tuesday, 2:00–3:30 PM
- `genpride-pride-writers` — 1st & 3rd Wednesday, 1:30–4:00 PM
- `genpride-dr-johns-tech-assist-clinic` — 1st & 3rd Thursday, 12:00–4:00 PM
- `genpride-grief-and-loss-support-group` — 2nd & 4th Tuesday, 5:00–6:30 PM

**Skipped**: "Game Club" (1st, 2nd & 3rd Tuesdays — three ordinals isn't a
pattern `lib/config/recurring.ts`'s `parseSchedule` supports; only `every`,
`last`, a single ordinal, or an exact `Nth and Mth` compound are parseable).
Encoding it as "1st and 3rd" would misrepresent the real schedule (silently
dropping the 2nd Tuesday), so it was left out rather than guessed.

Verified via `ONLY_SOURCE=genpride-hot-lunch,genpride-seasoned-together,genpride-senior-trans-support-group,genpride-elders-meet-and-greet,genpride-senior-mens-support-group,genpride-pride-writers,genpride-dr-johns-tech-assist-clinic,genpride-grief-and-loss-support-group npm run generate-calendars`:
all 8 calendars built with 0 errors (Hot Lunch: 2 events for its two
weekly schedules, all others: 1 event each for their monthly-ordinal
schedules), 9 events across the 3 new tag aggregates. Full `npm run
test:all` green.
