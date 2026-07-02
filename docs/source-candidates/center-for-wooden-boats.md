---
name: "Center for Wooden Boats"
status: added
platform: Custom HTML scraper (Squarespace, no events collection)
url: https://cwb.org/events/
tags: [Community, "South Lake Union"]
firstSeen: 2026-06-30
lastChecked: 2026-07-02
pr: 829
---

**Center for Wooden Boats** — `https://cwb.org/events/` — community boating museum and makerspace at 1010 Valley St, South Lake Union on Lake Union. Hosts public sails, regattas, anniversary dinners, and educational events. 2026 is their 50th Anniversary season.

Investigated 2026-06-30:
- Squarespace site confirmed (cwb.org / www.cwb.org)
- Standard Squarespace JSON endpoint (`?format=json`) redirects to `www.cwb.org` but returns empty body — events may be in a non-collection page structure rather than a standard Squarespace events collection
- Events page HTML shows 1 upcoming event: **Dinner on the Docks with Sugartime Trio** (July 23, 2026, 6–9 PM, 21+, 50th Anniversary)
- Navigation mentions other events (Sunday Public Sail, Tiny Boat Regatta, Spring Fling Sailing Regatta) but specific dates not visible

Investigated further 2026-07-02:
- Confirmed `/events` and `/events-1?format=json` are dead ends (redirect to a single static past-event page / an unrelated Squarespace `folders` collection respectively) — there is no real events collection, matching every prior check
- However, four of the standalone pages linked from nav have real, current, cleanly-formatted date info: `/public-sail` publishes a pipe-separated "`<year> Public Sail Dates:`" list (6 Sundays/year, free volunteer-crewed boat rides on Lake Union), `/50th` and `/dinneronthedocksw/sugartime` each have a dated details block (`<p>` of `<strong>` lines: date, time range, location) for the **50th Anniversary Reunion** (Sat Aug 22, 2026, 5–8 PM, $15) and **Dinner on the Docks with Sugartime Trio** (Thu Jul 23, 2026, 6–9 PM) respectively, and `/wood-regatta` has a dated heading plus a "Tentative Race Day Schedule" list for the **Norm Blanchard W.O.O.D. Regatta** (Sat Sep 19, 2026) — registration start time is parsed from that schedule list's first timed entry rather than hardcoded, so a future schedule shift is picked up automatically
- Implemented as a custom `IRipper` (`sources/center_for_wooden_boats/ripper.ts`) that fetches those four known pages directly and extracts date/time from their consistent block/heading structure, rather than guessing at a nonexistent events collection. A shared `parseDetailsPageEvent` handles the two "details block" pages (50th Anniversary, Dinner on the Docks); `parseTimeRange` handles both time-range shorthands the site uses ("5:00 PM – 8:00 PM" and "6:00–9:00 PM")
- Verified live via `ONLY_SOURCE=center-for-wooden-boats npm run generate-calendars`: **6 events, 0 errors** (3 remaining Public Sail dates for 2026, plus Dinner on the Docks, the 50th Anniversary Reunion, and the Norm Blanchard Regatta)
- Fixtures scrubbed of the Squarespace-embedded Google Maps `gmRenderKey` and reCAPTCHA Enterprise site key (gitleaks caught both on the first push — see PR #829 history)
- `sources/center_for_wooden_boats/ripper.yaml`, `sources/center_for_wooden_boats/ripper.ts`, `sources/center_for_wooden_boats/ripper.test.ts`
