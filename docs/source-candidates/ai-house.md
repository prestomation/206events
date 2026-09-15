---
name: "AI House"
status: added
pr: 1479
platform: Luma
url: https://luma.com/aihouse
tags: [Tech, Belltown]
firstSeen: 2026-09-15
lastChecked: 2026-09-15
---

AI House is Seattle's AI innovation hub at 2801 Alaskan Way (Pier 70, Seattle
Waterfront), hosting founder meetups, VC AMAs, fireside chats, and pitch
nights for the local AI community.

Investigated 2026-09-15 (discovered via a Luma search for the "New Tech"
aggregator gap candidate's sample event, which led to AI House's own Luma
calendar): `luma.com/aihouse` returns HTTP 200 server-rendered HTML with a
Next.js `__NEXT_DATA__` script tag embedding the full upcoming-events list at
`props.pageProps.initialData.data.upcoming.entries` (`has_more: false`, i.e.
this is the complete list, not a truncated page). Confirmed **14 upcoming
events** at fetch time (Sept 15 - Oct 23, 2026): Founder Showcase (recurring),
VC AMAs, Pitch Please, fireside chats, a founder mental-health meetup, etc.
Each entry carries a stable `event.api_id`, `name`, `start_at`/`end_at`
(ISO 8601 with `timezone`), a per-event `url` slug (`luma.com/<slug>`), and a
`cover_url` image. Almost every event's `geo_address_info.full_address`
resolves to "AI House, 2801 Alaskan Wy, Seattle, WA 98121, USA" — the one
exception found had `geo_address_visibility: guests-only` (address hidden
until RSVP) but its `coordinate` still sits in the same Seattle Waterfront
block, confirming it's the same venue. Not found under `sources/` (distinct
from `sources/new_tech_seattle`, which is a different org's Meetup.com
calendar at a different venue, The Collective Seattle).

No public `api.lu.ma` REST endpoint accepts the `cal-*` id directly (tested,
returns `400 Invalid request`), so implementing as a custom HTML/JSON
scraper reading the page's embedded `__NEXT_DATA__` blob — same pattern as
`sources/new_tech_seattle/ripper.ts` (Meetup's Apollo cache), adapted for
Luma's `upcoming.entries` shape. Fixed venue → ripper-level `geo`,
`sourceRole: venue`.

**Implemented 2026-09-15 (PR #1479):** `sources/ai_house/`. 14 events, 0 parse
errors confirmed via `ONLY_SOURCE=ai-house`.
