---
name: Emerald City Softball
status: candidate
platform: WordPress (LeagueApps)
url: https://emeraldcitysoftball.org
tags: [Playing-Sports, Softball]
firstSeen: 2026-08-14
lastChecked: 2026-09-16
---

Seattle adult recreational softball league.

Verified 2026-08-14: live site for Seattle's LGBTQIA+ and allied softball
league (est. 1980). WordPress (`/wp-content/uploads/` paths) with
**LeagueApps** handling schedules/registration/standings — LeagueApps
often exposes a public schedule API/ICS per-org; worth checking during
implementation. Confirmed dated activity: Fall Ball registration open,
Hall of Fame Induction (Jul 25, 2–5pm at Koko's on Capitol Hill),
divisional schedules (A/B, C, D, E). Not a religious org; not found
under `sources/`.

Re-checked 2026-09-16: the WordPress site does expose a Tribe-Events-style
ICS export (`https://emeraldcitysoftball.org/events/?ical=1`, linked from
`<link rel="alternate" title="...iCal Feed">` in the page head), but it
returns an empty (0 VEVENT) calendar — the org isn't posting to the
WordPress events post type. The LeagueApps-hosted league page
(`myecsa.leagueapps.com/leagues/softball/...`) has no discoverable public
ICS/API endpoint either. Per the "200 + 0 events" rule, do not implement
yet; re-check next cycle for either feed to populate.
