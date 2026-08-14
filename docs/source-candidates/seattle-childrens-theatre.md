---
name: Seattle Children's Theatre
status: candidate
platform: Custom HTML (ticketing platform not identified)
url: https://www.sct.org
tags: [Theater, Family]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Seattle Center theater company producing plays for young audiences and families.

**Vetting notes (2026-08-14):** Real, well-established Seattle Center theater
company (box office (206) 441-3322). Confirmed live season page: 8
productions for the 2026-27 season running Oct 2026 - June 2027, with a
"Calendar" link under "Tickets & Shows" in nav. Ticketing/back-end platform
not identifiable from the fetched content (no Tessitura/AudienceView/Spektrix
branding visible); no ICS/API feed found. Would need a follow-up fetch of the
actual `/calendar` page and/or view-source inspection for a ticketing widget
that might expose structured data. Grepped `sources/` for "sct"/"children's
theatre" — only an unrelated string match in a test fixture, so not currently
covered.
