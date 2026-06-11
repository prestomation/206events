---
name: "Communities of Opportunity"
status: added
platform: Squarespace
url: https://www.coopartnerships.org/community-events
tags: [Activism, Community]
firstSeen: 2026-06-11
lastChecked: 2026-06-11
pr: 603
---

Network of residents, communities, funders, and decision-makers working on equity and racial justice in King County. Hosts community events, forums, festivals, and capacity-building workshops.

Key findings from 2026-06-11 investigation:
- Squarespace site with working `?format=json` endpoint (events in `upcoming` array)
- 18 upcoming events confirmed (June–October 2026)
- Mix of in-person community events (Juneteenth Freedom Festival, 98118 Fest, Community Power Night) and virtual webinars
- Events span Seattle and South King County (Federal Way, SeaTac, Burien area)
- No proxy needed; direct Squarespace ripper works
- Location: 401 Fifth Ave, Seattle, WA 98104 (org HQ), but source-level geo is null (events held at various locations)
- Implemented as `type: squarespace` with `geo: null`
