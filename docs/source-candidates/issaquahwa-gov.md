---
name: Concerts on the Green: Atomic Pop
status: added
platform: Unknown
url: https://www.issaquahwa.gov/Calendar.aspx?EID=14594&month=8&year=2026&day=17&calType=0
tags: ["music", "family", "literary", "festivals"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Discovered via aggregator gap analysis. 9 events in the Seattle
metro sample. Source domain: issaquahwa.gov.

Sample event: "Concerts on the Green: Atomic Pop" (2026-08-25T19:00:00.000Z)
Description: Outdoor concert featuring Atomic Pop on the Issaquah Community Center lawn.

Checked 2026-09-23 (notviable): Outside Seattle: City of Issaquah calendar (Issaquah Community Center).

**Re-evaluated 2026-09-23 (King County rule) -> added.** Issaquah is in King County. The CivicPlus calendar publishes per-category iCal feeds (`/common/modules/iCalendar/iCalendar.aspx?catID=N&feed=calendar`). Their LOCATION values embed HTML (`<p>Venue</p> - street  City WA zip`), which geocoded badly as a plain external feed. So I added a small custom ripper that parses the ICS and normalizes the location. New source: `sources/issaquah/` (name `issaquah`, tag `Issaquah`) with calendars `community-events` (catID 37, tag `Community`: Salmon Days, open mics, BOO at the Barn; 10 events) and `parks-events` (catID 40, tag `Parks`: plantings, Green Issaquah, Tots and Trees; 14 events). Skipped council/boards/closures/public-hearing categories.
