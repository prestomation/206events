---
name: Gingers Pet Rescue Events
status: investigating
platform: WordPress (The Events Calendar / Tribe Events)
url: https://www.gingerspetrescue.org/events
tags: [Pets]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
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
