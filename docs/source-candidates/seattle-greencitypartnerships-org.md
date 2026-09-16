---
name: Green Seattle Partnership
status: added
platform: Custom HTML (Forterra/CEDAR volunteer-management platform)
url: https://seattle.greencitypartnerships.org/event/calendar/
tags: ["Volunteer", "Outdoors"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
pr: 1495
---

Discovered via aggregator gap analysis. 3 events in the Seattle
metro sample. Source domain: seattle.greencitypartnerships.org.

Sample event: "Lizard Haven Restoration Maintenance" (2026-08-25T16:30:00.000Z)
Description: Restoration at Discovery Park's Lizard Haven - pulling and digging blackberry resprouts, spreading wood chip mulch, watering and cutting thistles. Meet at the large black cistern 800' due west of the

**Implemented 2026-09-16:** Re-checked `/event/calendar/` and found a
clean, unprotected (no CAPTCHA/Cloudflare) HTML listing of every
upcoming Green Seattle Partnership work party citywide — 38 events at
time of check, spanning 30+ named Seattle parks and greenspaces
(Discovery Park, Magnuson Park, Cheasty Greenspace, Longfellow Creek
greenspaces, Golden Gardens, etc). Each listing row carries the title,
a `Month Day, start-end @ Location` line, and a short description —
everything needed in one fetch, no per-event detail-page requests.
Individual event detail pages (`/event/<id>/`) turned out to be
inconsistent for automation: some are native pages with a "Date & Time"
field and exact meeting-point lat/lng, but others (org-hosted work
parties, e.g. DNDA's) 302-redirect off-domain to the partner org's own
site — so the ripper intentionally sources everything from the listing
page alone rather than depending on detail pages.

Implemented as a custom `IRipper` (`sources/green_seattle_partnership/`,
`sourceRole: venue` — Green Seattle Partnership is the first-party
organizer of its own citywide work-party program across many parks
(same shape as `spl`'s multi-branch `venue` role), not a show-listing
site republishing other orgs' independently-run events, per
`docs/cross-source-event-dedup.md`'s curated aggregator set. `geo: null`
since events span 30+ distinct park locations — per-event `location`
strings like "Burke-Gilman Trail, Seattle, WA" are geocoded by the
standard pipeline. Tagged `Volunteer` (matching the existing tag already
used by `furniture_repair_bank`/`seatoday` rather than introducing a
near-duplicate "Volunteering") and `Outdoors` (habitat restoration work
is uniformly open-air). Every event is parsed with `cost: { min: 0 }`
directly (Green Seattle Partnership work parties are always free) —
no ripper-level `cost:` default needed since a ripper-parsed cost
always wins.

Description text is extracted from each listing row's second `<p>` with
all inline HTML markup stripped (not just entity-decoded), so any
mid-paragraph tag never leaks into the published description.

The listing never states a year, so the ripper rolls the parsed month
forward to next year when it's already earlier than the current month
(same convention as `nw_metal_calendar`), rather than trusting the
page's own single date header (which reflects the page's rolling
window start, not necessarily "today").

Verified 35 upcoming events, 0 parse errors via
`ONLY_SOURCE=green-seattle-partnership`. 8 of the 35 events hit
Nominatim gaps on internal Green-Seattle-specific micro-site names
("Longfellow Creek GS: Central", "Judge Charles M. Stokes OverlK", etc)
— left for the geo-resolver skill to backfill via `KNOWN_VENUE_COORDS`
rather than guessing coordinates here.

Supersedes `docs/source-candidates/green-seattle-volunteer.md`, which
tracked the same organization's `greenseattle.org` marketing domain
(blocked by an sgcaptcha challenge) — that domain was never the right
fetch target; this platform subdomain was. 
