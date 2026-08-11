---
name: "Talarico's Pizzeria"
status: candidate
platform: Squarespace (Events collection)
url: https://www.talaricospizza.com/event
tags: [Nightlife, "West Seattle"]
firstSeen: 2026-08-11
lastChecked: 2026-08-11
---

West Seattle pizzeria (4718 California Ave SW) well known locally for its
long-running Wednesday trivia night (hosted by Phil Tavel, 500+ weeks
running per West Seattle Blog / EverOut coverage) plus karaoke nights.

Site is Squarespace, with a dedicated `/event` collection page in the nav.
Fetched `https://www.talaricospizza.com/event?format=json` on 2026-08-11:
valid Squarespace JSON, but the `collection` object reports
`"itemCount":0` — the venue has an Events collection configured but hasn't
populated any items in it (recurring nights are likely promoted only via
social media / West Seattle Blog listings, not this collection).

Per the quality-gate rule for "200 + 0 events," not implementing now.
Re-check `?format=json` on a future cycle — if the collection stays
permanently empty, this may end up better modeled as a
`sources/recurring/` weekly-trivia entry (like `the-dock-sport-bar-and-grill`)
using the day/time confirmed by third-party listings, rather than waiting on
the Squarespace collection to be populated.
