---
name: "The Growler Guys - Seattle Northeast"
status: investigating
platform: WordPress (The Events Calendar / Tribe)
url: https://thegrowlerguys.com/locations/seattle-northeast/
tags: []
firstSeen: 2026-09-25
lastChecked: 2026-09-25
---

Craft-beer taproom chain location at 8500 Lake City Way, Seattle, WA
98115 (Lake City neighborhood, King County — confirmed via the page's
JSON-LD `PostalAddress`). The parent site (`thegrowlerguys.com`) runs
The Events Calendar (Tribe) WordPress plugin — confirmed via
`wp-json/tribe/events/v1/` REST endpoint and an `?ical=1` feed link in
the page HTML.

Checked 2026-09-25: both `GET /wp-json/tribe/events/v1/events?per_page=10`
and `GET /events/?ical=1` return **0 events** (REST: `"total": 0`; ICS:
0 `VEVENT`s). The plugin is installed site-wide but no events are
currently published — matches the "200 + 0 events" case in the
source-discovery quality gate (don't implement yet, don't mark not
viable). Also unclear whether this chain-wide calendar would need
per-location filtering (Tribe supports per-venue taxonomy) once events
do appear. Re-check in a future cycle for populated events.
