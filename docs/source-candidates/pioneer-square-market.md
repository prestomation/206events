---
name: "Pioneer Square Market"
status: added
firstSeen: 2026-05-06
lastChecked: 2026-05-18
tags: [Community, "Pioneer Square", Music]
pr: pending
---
Implemented via Supabase PostgREST API (`public_events` table) with public
anon key extracted from the site's JS bundle. API returns 51 upcoming events
(44 Seattle WA + 7 Vancouver BC World Cup soccer). Vancouver events are filtered
out by checking `venue_location.state !== 'WA'`. Events include concerts,
community events, festivals, and markets in and around Pioneer Square.

Source: `sources/pioneer_square_market/ripper.ts`
