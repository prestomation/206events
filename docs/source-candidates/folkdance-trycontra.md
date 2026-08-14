---
name: Folk Dance TryContra Seattle
status: notviable
platform: ICS Feed (custom, city-filterable)
url: https://www.folkdance.page/calendar?date=all&country=USA&city=Seattle&styles=contra&multiday=true&workshop=true&organisation=TryContra
tags: [Dancing, Folk]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Filtered folk dance calendar for TryContra contra dance events in Seattle.

Redundant with `docs/source-candidates/folkdance-page.md`: same
folkdance.page ICS engine (`/index.ics` with query-param filters), just a
narrower `styles=contra&organisation=TryContra` subset. Confirmed by
direct fetch — this filtered URL's ICS equivalent returns only 6 VEVENTs,
all already included in the broader `city=Seattle` feed (333 VEVENTs,
already tagged `CATEGORIES:contra` etc). Implement the general
folkdance-page feed instead; no need for a second, narrower source
against the same upstream.
