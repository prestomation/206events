---
name: Tacoma Rainiers Schedule
status: investigating
platform: Unknown
url: https://www.milb.com/tacoma/schedule
tags: [Watching-Sports, Baseball]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Triple-A affiliate of the Seattle Mariners. Home games at Cheney Stadium in Tacoma.

Blocked: WebFetch returned HTTP 406 Not Acceptable on both `/tacoma/schedule` and
`/tacoma` (bot-detection style block, not a definitive dead site). MiLB team sites
typically run on the MLB.com platform (statsapi-backed schedule data), which could be a
strong future source if fetched with a proper browser/proxy. Also note: Tacoma is
Pierce County, not Seattle proper — borderline on the Seattle-focus bar even if unblocked;
worth weighing against a MLB affiliate radius policy before implementing.
