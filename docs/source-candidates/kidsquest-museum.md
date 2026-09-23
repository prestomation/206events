---
name: KidsQuest Museum Events
status: blocked
platform: Unknown (Cloudflare-protected)
url: https://kidsquestmuseum.org/events
tags: [Family, Museums]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
---

Bellevue children's museum offering hands-on learning events and family programs.

Blocked: every fetch attempt (WebFetch: HTTP 403; curl with a browser
user-agent: Cloudflare "Just a moment..." JS challenge page) is stopped
before any real content loads. Can't confirm platform or event
volume/dates from direct fetch. Would need a proxy (or a
JS-challenge-solving fetch, e.g. browserbase) to evaluate further.

**2026-09-23:** Venue is in Bellevue (outside Seattle), and the site still
returns a Cloudflare "Just a moment..." challenge (HTTP 403). Closed as
notviable (outside Seattle).

**Re-opened 2026-09-23 (King County rule; blocked):** Bellevue is in King County, so the venue now passes the geography gate (the other KidsQuest file, `kidsquestmuseum-org.md`, sorts after this one). Re-checked the blocker: every URL on both `kidsquestmuseum.org` and `www.kidsquestmuseum.org` (`/`, `/events/`, `/events/?ical=1`, `/wp-json/tribe/events/v1/events`) returns HTTP 403 with a Cloudflare "Just a moment..." JS challenge, even with a browser user-agent. The Tribe ICS/JSON endpoints look likely but can't be verified. Not stageable for proxy testing from here (blocked locally too); a browserbase rung is the only plausible path.
