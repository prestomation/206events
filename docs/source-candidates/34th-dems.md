---
name: 34th District Democrats
status: added
platform: recurring YAML
url: https://34dems.org/news-events
tags: [Political, "West Seattle"]
firstSeen: 2026-08-14
lastChecked: 2026-09-16
pr: 1497
---

34th Legislative District Democrats of West Seattle meetings and political events.

**Checked 2026-08-14:** Live WordPress site (Osmosis theme), not a
religious org. No dedicated events calendar page or ICS/RSS feed found —
"News & Events" nav resolves to informational content. Homepage does
mention a concrete upcoming meeting ("Wednesday, August 12, via Zoom,
7:00 PM"), suggesting a monthly-meeting cadence similar to 36th District
Democrats. Low volume (likely ~10 meetings/year); would need HTML
scraping of the news feed or meeting-announcement posts. Seattle-focused
(West Seattle district).

**Implemented 2026-09-16:** The org's own `/minutes/` page states the
authoritative cadence explicitly: "Membership Meetings are generally held
on the second Wednesday of each month... All Membership Meetings are open
to the public." Confirmed against the homepage's live "next meeting"
banner (Sept 9, 2026 — a 2nd Wednesday) and multi-year minutes history
(2019–2026) matching the 2nd-Wednesday pattern. Meetings are currently
held via Zoom (no fixed physical venue), so implemented as
`sources/recurring/34th-district-democrats.yaml` with `geo: null`,
`sourceRole: venue` — same shape as
`sources/recurring/downtown-seattle-community-council.yaml`. Tagged
`Political` and `West Seattle` (34th LD covers West Seattle, White
Center, Vashon Island, and Burien). Added the org's logo
(`https://34dems.org/wp-content/uploads/2017/01/34DEMS.png`) as
`imageUrl` for parity with `36th-district-democrats.yaml`.

Cross-checked the `months:` restriction against the full minutes archive
on `/minutes/` (2019–2026, ~55 entries): **December has zero meeting
minutes in any of the 7 full years on record** — a consistent holiday
recess — so `months` excludes 12. July/September/October each have a
one-off gap in a single year (likely COVID disruption in 2020, or minutes
simply not yet posted) but no consistent pattern, so those months are
left in.
