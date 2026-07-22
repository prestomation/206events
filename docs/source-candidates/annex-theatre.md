---
name: "Annex Theatre"
status: notviable
platform: Squarespace (NeonCRM events widget)
url: https://www.annextheatre.org/events
firstSeen: 2026-07-22
lastChecked: 2026-07-22
---

Long-running artist-run fringe theatre at 1100 E Pike St, Capitol Hill.
Produces new plays, ensemble-generated work, and the monthly late-night
variety show "Spin the Bottle."

Investigated 2026-07-22:
- Site is Squarespace, but `/events` is a static page, not a real
  Squarespace events collection (`?format=json` returns HTML, not JSON)
- The real event listing is embedded via a NeonCRM widget
  (`annextheatre.app.neoncrm.com/nx/portal/neonevents/events`) — fetched
  directly, but the page is a client-rendered app shell with no static
  event data, JSON-LD, or discoverable API endpoint in the HTML
- Would need JS rendering (Browserbase) to find the widget's real data
  endpoint before this could be scoped
