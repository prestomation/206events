---
name: "The Picklr Fremont"
status: blocked
platform: unknown (Cloudflare-protected booking portal)
url: https://thepicklr.com/location/fremont/
tags: [Sports]
firstSeen: 2026-09-23
lastChecked: 2026-09-23
---

Pickleball franchise location in Fremont (part of the national "The Picklr"
chain). Marketing site (`thepicklr.com`) only has `SportsActivityLocation`
JSON-LD, no `Event` structured data. Its "Events" program listing lives on a
separate booking subdomain (`fremont.thepicklr.com/programs?...category=Events`),
which returns a Cloudflare "Just a moment..." JS challenge (403) even from
this environment — blocked, not just CI. Per the blocked-source rule (fetch
fails locally too), not staged for the proxy ladder; recording as blocked.
