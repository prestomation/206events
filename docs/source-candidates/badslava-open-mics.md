---
name: Badslava Seattle Open Mics
status: added
platform: Custom HTML (dynamic PHP directory)
url: https://badslava.com/seattle-open-mics.php
tags: [Music, OpenMic]
firstSeen: 2026-08-14
lastChecked: 2026-09-04
---

Directory of open mic nights across Seattle venues including music, comedy, and poetry.

**Checked 2026-08-14:** Confirmed live and current — page shows the
specific week (Aug 14-20, 2026) with 30+ venues across every day,
day/time per listing (e.g. Innervisions & Rickshaw Fri 7pm, Halcyon
Brewing Sat 8pm). Community-maintained (correction email in header),
dynamic PHP-generated page, no ICS/API. Caveat: significant overlap
with venues already covered individually as `sources/recurring/`
entries (conor-byrne-open-mic, couth-buzzard-open-mic,
hopvine-pub-open-mic, skylark-cafe-open-mic, fremont-abbey-open-mic,
little-red-hen-sunday-open-mic) — value here is mainly the many other
listed venues not yet covered (Club Comedy Seattle, Fremont Abbey,
The Crocodile, Unexpected Productions, etc). Would need de-dup logic
against existing recurring sources if implemented as an aggregator.

**Implemented 2026-09-04 (PR pending):** A detail-page spot check
(Substation Seattle's "Manic Mic") showed `Event Frequency: Monthly`
with `Event Notes: ... but what week may vary` — so the listing page
is not a raw weekly-recurring schedule, it's whatever the site
believes is actually happening in the visible week (accounting for
monthly/biweekly/irregular cadence per venue). That makes a plain
`HTMLRipper` the right fit rather than inferring a recurring rule:
fetch the page fresh every build and take that week's table at face
value. The table itself is clean, semantic HTML — `<th colspan="2">`
day/date header rows followed by `<tr><td>time</td><td><a
href="details.php?id=N"><b>Venue</b><br>full street
address</a></td></tr>` data rows — so no detail-page fetches were
needed; venue name + full address + time all come from the listing
page in one request. `sourceRole: aggregator` / `geo: null` since it
spans many different venues, several of which already have their own
`venue`-role `sources/recurring/` entries for the same open mic
(Skylark Cafe, Hopvine Pub, Fremont Abbey, Couth Buzzard) — the
existing cross-source dedup system is expected to defer to those as
canonical once the next full (non-`ONLY_SOURCE`) build cross-checks
them; this source's value is the ~20 other listed venues that don't
have a dedicated source. Verified 26 events, 0 errors, 0 geocode
errors via `ONLY_SOURCE=badslava-open-mics`.
