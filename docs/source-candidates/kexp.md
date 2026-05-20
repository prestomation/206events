---
name: KEXP
status: added
platform: Custom HTML (Aldryn Events / Django CMS)
url: https://www.kexp.org/events/kexp-events/?category=in-studio
tags: [Music, QueenAnne]
firstSeen: 2026-05-20
lastChecked: 2026-05-20
pr: 
---

KEXP 90.7 FM public in-studio sessions at their studio at 472 1st Ave N (Seattle Center campus). The events page lists upcoming in-studio recordings open to the public, marked with "(OPEN TO THE PUBLIC)" in the title.

No ICS feed available. The page uses Aldryn Events (Django CMS plugin) which renders HTML articles with `article.aldryn-events-article` elements and an `addeventatc` calendar widget containing structured start/end/timezone data.

Implemented as a custom IRipper in `sources/kexp/`. Replaced the existing `seattle-showlists` KEXP Studio calendar entry.
