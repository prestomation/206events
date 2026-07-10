---
name: UW HuskyLink (Student Organization Events)
status: dead
platform: CampusGroups (migrated from Anthology Engage / CampusLabs)
url: https://huskylink.washington.edu/events
tags: [Community, University District]
firstSeen: 2026-05-28
lastChecked: 2026-07-10
pr:
---

UW's official Registered Student Organization (RSO) event platform,
previously running on the Anthology Engage / CampusLabs Engage stack (see
history below). As of 2026-07-10 the daily build-report flagged the ripper
as crashing:

```
Ripper crashed: Error: Expected JSON but got content-type "text/html; charset=utf-8" from
https://huskylink.washington.edu/api/discovery/event/search?...
```

## Root cause: full platform migration

`huskylink.washington.edu` now 302-redirects every request (including the
old `/api/discovery/event/search` endpoint and the `/events` listing page)
to `washington.campusgroups.com` — UW has switched RSO platforms from
Anthology Engage/CampusLabs to **CampusGroups**, a different vendor with a
different API shape (`organizationName`, `categoryNames`, `benefitNames`,
`imagePath` fields no longer apply). The old discovery endpoint now returns
an HTML "Error Page", not JSON.

Because the crash happens before any file is written, the calendar was
never present in the deployed manifest (confirmed against the production
`206.events/manifest.json` and `build-errors.json` — zero `huskylink`
references in the manifest). No `allowed-removals/` entry was needed when
disabling the source.

## Investigation: does CampusGroups expose a usable public feed?

Checked (2026-07-10, plain `curl`, no auth/cookies):

- **Static ICS feed** — `https://washington.campusgroups.com/ical/washington/ical_washington.ics`
  (linked from the `/events` page's "Subscribe" button). Returns HTTP 200,
  valid iCalendar, but only **2 VEVENTs** total (both instances of the same
  admin-posted "Student Activities Fair"), each with
  `LOCATION: Sign in to download the location`.
- **Custom/filtered ICS** — `/ics{?filters}&school=washington` (built by the
  page's `createCustomICSLink()`), same gating expected since it's built
  from the same underlying dataset.
- **Mobile listing JSON widget** — `https://washington.campusgroups.com/mobile_ws/v17/mobile_events_list?range=1&limit=100`
  (the actual endpoint the `/events` page's "load more" JS hits, found via
  `getWebServiceUrl()` in the page's inline JS). Returns HTTP 200 JSON, but
  again only `"counter":"2"` — the same 2 public events, with
  `eventLocation: "Private Location (sign in to display)"`. `/mobile_ws/v18/`
  and other guessed API shapes (`/api/discovery/event/search` on the new
  domain, `/api/event/search`, `/api/events`) all 404 or hit the same "Error
  Page" as above. `robots.txt` disallows `/mobile_ws/v17/` and `/v18/`
  (informational, not an access block — the endpoint answers fine, it's just
  scoped to admin/school-wide events).
- The server-rendered `/events` HTML itself only embeds **one** event card
  (`id="event_..."`) — everything else is loaded client-side via the same
  gated `mobile_ws` endpoint.

**Conclusion:** CampusGroups at UW is configured so that individual RSO club
events (the bulk of what HuskyLink used to expose) require an authenticated
UW NetID/SSO session to view at all — even the location field is blanked
out ("sign in to display") on the 2 events that *are* publicly visible. This
isn't a CI-IP-block or rate-limit issue (confirmed via curl from a
non-GitHub-Actions IP); it's an institutional privacy/visibility setting on
the CampusGroups tenant. There is no plain-HTTP public data path to recover
club-level events. A browser-automation approach authenticated with a UW
NetID would be required, which is out of scope for this project's proxy
ladder (`outofband`/`browserbase` both assume unauthenticated fetches).

## Disposition

Disabled the ripper (`disabled: true` in `sources/uw_huskylink/ripper.yaml`)
rather than deleting it — the parsing logic for the old Engage-shaped
payload is preserved (with an explanatory comment) in case UW ever exposes
a public CampusGroups feed, or restores/adds an unauthenticated discovery
API. Marked `status: dead` here since it needs a genuinely new approach
(most likely: none is currently possible) rather than a routine fix.

---

### History (pre-migration, Engage/CampusLabs era)

Identified via a source-from-event lookup on a UW Night Market poster
(May 23 2026 at Red Square, hosted by TSAUW). The Night Market itself
was not posted to HuskyLink, but the platform was the natural "general"
source for the broader category of UW student-org events that the
existing `uw-campus-events` Trumba feed misses (cultural celebrations,
club showcases, dance/music nights, networking events, etc.).

Sample response — small set near end-of-spring-quarter (8 events 2026-05-23
→ 2026-06-03), 247 events over the prior year. Event venues were scattered
across UW Seattle campus (Kane Hall, Mary Gates, Savery, MEB, Odegaard, HUB,
etc.), so the ripper used ripper-level `geo: null` with per-event `lat`/`lng`
from the API payload when present. Image URLs resolved under
`https://se-images.campuslabs.com/clink/images/{imagePath}`; event pages at
`https://huskylink.washington.edu/event/{id}`.
