---
name: Saving Great Animals Events
status: proxy
platform: ICS (Tribe Events)
url: https://savinggreatanimals.org/events/
tags: [Community, Volunteer]
firstSeen: 2026-08-14
lastChecked: 2026-08-19
pr: 1222
---

Seattle-area animal rescue hosting adoption events and volunteer opportunities.

**Vetting notes (2026-08-14):** Strong find. Real, live WordPress site running
The Events Calendar (Tribe Events) plugin — confirmed by `tribe_events` in the
calendar feed URLs. At least 3 upcoming events confirmed at check time (Flying
Bike Brewery trivia night, Dog Yard Bar adoption event, "The Bark Benefit 2026"
at Meydenbauer Center). The page exposes Google Calendar, iCalendar (webcal),
and Outlook export links — standard Tribe Events `?ical=1` style feed should
work directly as an `sources/external/*.yaml` ICS entry. No custom ripper
needed. Not yet covered by any existing source.

Implemented 2026-08-17 in PR #1222: `sources/external/saving-great-animals.yaml`,
`icsUrl: https://savinggreatanimals.org/events/?ical=1`, `geo: null`,
`sourceRole: venue` (first-party feed for one org's own event series,
even though events happen at rotating partner venues — same pattern as
`sources/seattle_social_club`), tags `[Community, Volunteer]` (no
existing `Pets`/`Animals` tag registered elsewhere, so reused existing
tags that fit the adoption/volunteer nature of the events rather than
introduce a new one-off tag). `ONLY_SOURCE=saving-great-animals npm run
generate-calendars` confirmed 3 upcoming events, 0 parse errors, 0
external calendar failures — from this environment.

**CI-blocked 2026-08-17:** the PR's CI build fetched the identical
`?ical=1` URL with the identical Chrome UA string the code sends, got
HTTP 200, but parsed 0 events (no fetch error thrown). Re-verified twice
from this environment immediately after (including with the literal
build UA string) — still a clean 200 with 3 `VEVENT`s both times. This
looks like a WAF/bot-management rule on the upstream WordPress site
serving reduced/empty content specifically to GitHub Actions IP ranges,
not a URL/parsing bug. Staged for proxy testing: PR #1222 left open at
`proxy: false`, labeled `requires-proxy-testing`, awaiting
`skills/proxy-escalation/SKILL.md` (out-of-band job) to test the
`outofband` → `browserbase` ladder and merge the working rung (or close
the PR if neither works).

**Verified 2026-08-19 (out-of-band job):** `outofband` rung confirmed
working from the residential IP — fetched 3 events, `hasFutureEvents=true`,
0 fetch errors. Lowest working rung; PR #1222 merged at `proxy: outofband`.
