---
name: Green Lake Crew Masters Calendar
status: added
platform: ICS (Google Calendar)
url: https://www.greenlakecrew.org/adult-crew/masters-calendar
tags: [Sports, Green Lake]
firstSeen: 2026-08-14
lastChecked: 2026-08-29
pr: TBD
---

Green Lake rowing crew masters program calendar with practice and regatta schedules.

Verified 2026-08-14: **stronger of the two greenlakecrew.org candidates**
(see also `greenlake-crew-events.md`). WordPress ("Out the Box" theme).
Confirmed dated 2026 events: Jul 26 Port Angeles Beach Sprints, Aug 1
Green Lake Summer Extravaganza (home regatta), Sep 19 Otter Island
Touring Regatta, Oct 16 Head of the Charles, Oct 31 Frostbite Regatta
(home regatta). Page also offers a **Google Calendar sync** option —
worth checking whether that exposes a public ICS URL during
implementation, which would avoid HTML scraping entirely. Not found
under `sources/`.

**Implemented 2026-08-29:** the masters-calendar page's Google Calendar
embed (`google.com/calendar/embed?src=cf14bf5211d6aeef4c0034234cadf8c341e408d55ab77e0337af98bb60500573%40group.calendar.google.com`)
is a **public** calendar — the standard
`https://calendar.google.com/calendar/ical/<id>/public/basic.ics` export
URL returns a valid VCALENDAR with 70 upcoming VEVENTs (confirmed live,
no auth needed). The calendar (`X-WR-CALNAME:GLSCC`,
`X-WR-CALDESC:Events happening at Green Lake Small Craft Center`) turned
out to be broader than just the Masters program — it covers every group
using the shared GLSCC boathouse (Green Lake Crew juniors/adults and the
Seattle Canoe & Kayak Club), so implemented as
`sources/external/greenlake-small-craft-center.yaml` (ICS, `geo: null`,
`sourceRole: venue`, tags `Sports`/`Green Lake`) rather than a
Masters-only source. Most events carry no per-event `LOCATION`; the ones
that do mostly say just `GLSCC`, so added `'glscc'` /
`'green lake small craft center'` to `KNOWN_VENUE_COORDS` in
`lib/geocoder.ts` (5900 W Green Lake Way N, Seattle — confirmed via
Nominatim) to resolve it without a geocode error. See also
`greenlake-crew-events.md`, which describes the same underlying
organization and is covered by this same feed.
