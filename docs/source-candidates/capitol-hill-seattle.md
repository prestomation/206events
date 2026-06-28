---
name: "Capitol Hill Seattle (CHS Blog)"
status: added
platform: The Events Calendar (WordPress) — ICS feed, proxy browserbase
url: https://www.capitolhillseattle.com/calendar/
icsUrl: https://www.capitolhillseattle.com/?post_type=tribe_events&ical=1&eventDisplay=list
tags: ["Capitol Hill", "Community"]
firstSeen: 2026-06-28
lastChecked: 2026-06-28
pr: pending
---
Community events calendar for the Capitol Hill neighborhood, published by Capitol
Hill Seattle (CHS Blog) — a long-running neighborhood news site.

The calendar is at `/calendar/#/` (The Events Calendar plugin's modern "blocks"
view with hash routing). The site is behind a Cloudflare managed challenge
(`cf-mitigated: challenge` confirmed by curl). All endpoints (REST API, ICS,
sitemap) return 403 with the Cloudflare JS challenge page.

Per AGENTS.md exception: confirmed Cloudflare JS challenge → skip directly to
`proxy: "browserbase"` (outofband/residential IP would receive the same challenge).

Evidence of The Events Calendar plugin:
- WordPress confirmed (robots.txt: `Disallow: /wp-admin/`)
- `calendar/#/` hash routing is the standard Tribe Events modern view URL pattern
- Same plugin/ICS endpoint pattern as `earshot-jazz.yaml` and `discover-magnolia.yaml`

Implemented as `sources/external/capitol-hill-seattle.yaml` with `proxy: browserbase`.
