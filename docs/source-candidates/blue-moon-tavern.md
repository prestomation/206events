---
name: Blue Moon Tavern
status: notviable
platform: Wix (widget-rendered calendar)
url: https://www.thebluemoonseattle.com/calendar
tags: [Nightlife, "University District"]
firstSeen: 2026-08-06
lastChecked: 2026-09-23
pr:
---

~90-year-old U-District dive bar with weekly open mic/karaoke/DJ
programming — genuinely uncovered elsewhere in the repo.

Site is Wix, but unlike Beguiled Books and The Dock, the calendar page
loads its event list via an iframe/`WarmupData` widget rather than
plain server-rendered markup — a plain `curl` only surfaces nav-text
mentions of "Live music," not actual dated events. Needs a follow-up
check for whether the iframe source is independently fetchable
(possibly a Bandsintown or Wix Events widget with its own JSON
endpoint) before this is viable as a scrape target.

Re-checked 2026-09-23: already covered — `sources/seattle_showlists/ripper.yaml` has a `blue-moon-tavern` calendar (venue "Blue Moon Tavern", University District). The venue's own Wix calendar page is an unconfigured "Google Calendar Connector" placeholder with no event data. Closing as a duplicate of the existing seattle-showlists calendar.
