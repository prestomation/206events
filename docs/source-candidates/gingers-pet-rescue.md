---
name: Gingers Pet Rescue Events
status: blocked
platform: WordPress (The Events Calendar / Tribe Events)
url: https://www.gingerspetrescue.org/events
tags: [Pets]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
---

Gingers Pet Rescue adoption events and fundraisers in the Seattle area.

Blocked (intermittent): one direct curl succeeded and showed WordPress
with **The Events Calendar** (Tribe Events) plugin loaded
(`wp-content/plugins/the-events-calendar/...` CSS/JS), which normally
exposes a standard `?ical=1` ICS export at `/events/?ical=1` — but every
subsequent fetch attempt (WebFetch and curl, several tries) hit either an
sgcaptcha (SiteGround) redirect or a bare 403, including the `?ical=1`
request itself. Couldn't confirm the feed live or check event volume/dates.
Platform looks promising; needs a proxy or a later retry to confirm.

**2026-09-23:** Re-checked `/events/?ical=1` and
`/wp-json/tribe/events/v1/events`: both return the SiteGround sgcaptcha
challenge. Can't verify the feed or event volume. Closed as blocked; if
retried, the Tribe ICS export would need `proxy: browserbase`.
