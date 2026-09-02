---
name: 48 North SARC
status: candidate
platform: ICS (WordPress / The Events Calendar)
url: https://48north.com/sarc
tags: [Outdoors, Sailing]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

48° North sailing magazine Seattle Area Racing Calendar covering Puget Sound regattas and sailboat races.

**Checked 2026-08-14:** Strong find. Live WordPress site using The
Events Calendar plugin (`tribe_events` post type in URLs). Confirmed
**ICS/iCal export, Outlook 365, and Google Calendar subscription links**
on the page. High volume — "more than 350 events hosted by more than 75
different clubs and organizers" for 2026, with ~10 events in the
August 15 week alone (Lido 14 North Americans, Vashon Challenge, PHRF
Saturdays, etc). Caveat: scope is Washington/Oregon/British Columbia
broadly, not Seattle-only — would need filtering to Puget Sound-area
clubs/venues if implemented. No ICS URL captured yet; grab it from the
"iCalendar/Outlook 365" export link on the page when implementing.

**Re-checked 2026-09-02:** Captured the real ICS URL from the page's
webcal links: `https://48north.com/?post_type=tribe_events&ical=1&eventDisplay=list&tribe_events_cat=sailboat-races`.
Fetched it directly — valid VCALENDAR, 30 VEVENTs, but **no LOCATION or
DESCRIPTION fields at all**, only `SUMMARY`/`URL`/`CATEGORIES` and an
`ORGANIZER;CN="<club name>"`. The organizer names in the current feed:
Anacortes YC, Bellingham YC, Center for Wooden Boats, Corinthian YC of
Edmonds, Corinthian YC of Tacoma, Port Townsend Sailing Association,
Rose City YC (Portland, OR), Royal Victoria YC (BC, Canada), Sloop
Tavern YC (Ballard — the only Seattle-proper club), South Sound Sailing
Society. Only 1 of 9 clubs in the current feed is Seattle-based; the
rest are explicitly out-of-scope per AGENTS.md ("venues entirely
outside Seattle — Edmonds, Everett, Kent — are not appropriate") or
out of state/country entirely. Without per-event location data there's
no reliable way to filter to Seattle-area events at parse time (would
require guessing region from organizer name alone, and Seattle would be
a small minority of the feed). Deprioritizing in favor of a
Seattle-proper candidate.
