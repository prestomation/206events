---
name: "Center for Wooden Boats"
status: candidate
platform: Squarespace (non-standard events setup)
url: https://cwb.org/events/
tags: [Community, "South Lake Union"]
firstSeen: 2026-06-30
lastChecked: 2026-06-30
---

**Center for Wooden Boats** — `https://cwb.org/events/` — community boating museum and makerspace at 1010 Valley St, South Lake Union on Lake Union. Hosts public sails, regattas, anniversary dinners, and educational events. 2026 is their 50th Anniversary season.

Investigated 2026-06-30:
- Squarespace site confirmed (cwb.org / www.cwb.org)
- Standard Squarespace JSON endpoint (`?format=json`) redirects to `www.cwb.org` but returns empty body — events may be in a non-collection page structure rather than a standard Squarespace events collection
- Events page HTML shows 1 upcoming event: **Dinner on the Docks with Sugartime Trio** (July 23, 2026, 6–9 PM, 21+, 50th Anniversary)
- Navigation mentions other events (Sunday Public Sail, Tiny Boat Regatta, Spring Fling Sailing Regatta) but specific dates not visible

**Next steps:** Inspect source HTML for the actual event collection path (e.g., `/events/` might be a standard page with embedded events — try alternate paths like `/events/upcoming/` or page source inspection). If they host more than 2-3 events per month in summer/fall, worth implementing as a Squarespace ripper with the correct collection URL. If the Squarespace JSON returns events in fall/winter programming, add then.
