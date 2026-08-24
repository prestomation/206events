---
name: "Seattle Tech Forum"
status: added
pr: 1276
platform: "ICS via Luma calendar API (not a standard built-in ripper type)"
url: https://www.seattletechforum.org/events
tags: ["Tech"]
firstSeen: 2026-08-17
lastChecked: 2026-08-24
---

**Seattle Tech Forum** — `https://www.seattletechforum.org/events` — professional
tech-community org running recurring meetups (job-seeker meetups, women-in-tech
forum, virtual + in-person sessions). Not Seattle-venue-exclusive per event, but
the org itself is Seattle-based and most events are local.

Investigated 2026-08-17:
- The site is Squarespace, but `/events?format=json` returns an empty
  `mainContent` — the events page is not a native Squarespace Events
  Collection, it embeds a **Luma** calendar (`lu.ma/seattletechforum`) via
  script/iframe instead.
- `lu.ma/seattletechforum` redirects (301) to `https://luma.com/seattletechforum`.
  The rendered page embeds `"api_id":"cal-eQcMdYUbFxXxonI"` for the calendar.
- Luma's ICS export endpoint works from that id:
  `https://api.lu.ma/ics/get?entity=calendar&id=cal-eQcMdYUbFxXxonI` — returns
  a valid `VCALENDAR` (`content-disposition: attachment;
  filename="SeattleTechForum.ics"`), confirmed **91 VEVENTs**, with `DTSTART`
  dates running from mid-2025 through Feb 2027 (still-future dates confirmed:
  Sept 2026 – Feb 2027 weekly occurrences).
- This is **not** the `?ical=1`/`.ics` URL pattern on the `lu.ma`/`luma.com`
  vanity slug itself (that 404s) — it requires resolving the internal
  `cal-*` id first by fetching the calendar's public page and grepping
  `"api_id":"cal-..."`.
- 🔥 High confidence for `sources/external/<name>.yaml` (plain ICS URL, no
  custom ripper code needed) — the feed URL above is a normal ICS endpoint
  once the `cal-*` id is known; it just isn't discoverable from a `/calendar`
  URL on the org's own domain the way most ICS feeds are.
**Implemented 2026-08-24** (PR #1276): added
`sources/external/seattle-tech-forum.yaml` using the ICS URL above.
Re-verified live at implementation time: 90 VEVENTs, 23 with future start
dates. `geo: null` / `sourceRole: venue` (org's own rotating in-person +
virtual meetups, not a fixed venue). Tag: `Tech`. Note: most Luma events
hide their venue address pre-RSVP, so many VEVENT `LOCATION` fields are
opaque `https://luma.com/event/...` links rather than street addresses —
these produce one-time non-fatal `GeocodeError`s that get cached as
`unresolvable` and won't re-report on subsequent builds.
