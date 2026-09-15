---
name: Washington Technology Events
status: added
platform: GrowthZone / Luma
url: https://www.washingtontechnology.org/events
tags: [Tech]
firstSeen: 2026-08-14
lastChecked: 2026-09-15
pr: 1490
---

Washington Technology Industry Association events, conferences, and tech networking.

Real, live site for WTIA (Issaquah, WA HQ), running on the GrowthZone
membership/events platform (footer: "Site by GrowthZone"). The fetched page
references named programs (Seattle AI Week 2026, Member Happy Hours,
Tech@Night, Tech in Focus, Legislative Lunch & Learn) rather than showing a
full dated event list inline — actual listings live behind a GrowthZone
member-events widget and a separate "Community Events" section on Luma.
Events are Seattle-area focused (Seattle AI Week etc.) despite the Issaquah
HQ. Would need a follow-up pass on the GrowthZone widget/API (GrowthZone
sites often expose a JSON events endpoint) or the Luma page to confirm
volume and scrapability. Not already covered, not religious.

**Implemented 2026-09-15:** followed the "Community Events" link on the
page (`https://luma.com/wtia`) rather than the GrowthZone widget — same
Next.js `__NEXT_DATA__` pattern already used by `sources/ai_house` and
`sources/improv_place`. This calendar is a genuine aggregator: it mixes
WTIA's own programming (Founder Cohort Demo Day, Tech@Night) with events
submitted by other orgs (Cyber Risk Alliance's Cybersecurity Summit, SASE
STEM Connect), so implemented with `sourceRole: aggregator`, `geo: null`,
per-event location. Externally-submitted entries have a different Luma
payload shape than WTIA's own (no event-level `api_id`, a `duration_interval`
ISO-8601 string instead of `end_at`) — handled by falling back to the
wrapping calendar entry's own stable id and parsing the ISO duration.
Zoom-only entries publish `location: "Virtual"` (a recognized
non-geocodable value) rather than guessing a Seattle address. 11 upcoming
events, 0 parse errors verified via `ONLY_SOURCE=wtia-community-events`.
Implemented as `sources/wtia_community_events/`.
