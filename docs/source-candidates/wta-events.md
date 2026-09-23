---
name: Washington Trails Association Events
status: added
platform: Plone (unconfirmed)
url: https://www.wta.org/get-involved/events
tags: [Outdoors, Volunteering]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
---

Washington Trails Association trail work parties, hikes, and volunteer events.

Real, established nonprofit (wta.org), site appears to run on Plone (CMS
theme/URL hints). The `/get-involved/events` page itself is a category index
(links out to "Trail Work Parties" schedule, photo contest, leadership
trainings, hiker events, Hike-a-Thon) rather than a single dated listing; a
follow-up guess at a dedicated schedule sub-URL 404'd. Programming is
statewide, not Seattle-specific, though trail work parties commonly occur in
King County near Seattle. Marked investigating rather than candidate/
notviable: needs the actual trail-work-party schedule page URL located and
checked for date/location structure and Seattle-area event density before
a real go/no-go call.

**2026-09-23:** Added as `sources/wta_work_parties/` (custom ripper, name `wta-work-parties`, `sourceRole: venue`, `geo: null`, tags Volunteer/Outdoors, `cost: free`). The work-party scheduler at `/volunteer/schedule` is a React app backed by `/volunteer/schedule/workparties.json?batch_num=N` (0-based, 10 per page, `results.last` = last batch). Each item has start/end datetimes and trailhead lat/lng. Programming is statewide (133 upcoming), so the ripper keeps only public, published work parties whose trailhead falls inside a Seattle city-limits bounding box. That gave 19 events at verification (Schmitz Preserve Park in West Seattle: adult and Youth & Families days). The site sits behind Cloudflare (`/cdn-cgi/` present), but the JSON returned 200 from here.
