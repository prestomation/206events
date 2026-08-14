---
name: King County Parks Events
status: candidate
platform: Socrata Open Data API (JSON)
url: https://kingcounty.gov/en/dept/dnrp/nature-recreation/parks-recreation/king-county-parks/get-involved/parks-events
tags: [Outdoors, Government]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

King County Parks community events, volunteer days, and outdoor activities.

Verified 2026-08-14: **strong pick**. The page embeds a Socrata Open Data
query directly in a `<script>` var:
`window.SOCRATA_API="https://data.kingcounty.gov/resource/grxi-zqg2.json?$where=start_time%20%3E%20%272026-06-29%27&parks=true"`.
Confirmed live and working by direct fetch — returns clean JSON with
`event_name`, `start_time`/`end_time`, `event_description_details`
(HTML), `location` (GeoJSON point lat/lng), `location_name`, `url`, and
category boolean flags (`parks:true` etc). Sample events pulled live:
"CHOMP! A celebration of local food and sustainable living" (Aug 15,
Marymoor Park), "Smoke on the Sound" BBQ competition (Sep 26-27,
Marymoor Park). This is a clean `JSONRipper` candidate — no auth
required, county-wide (would need per-event geo since events span many
parks, not one fixed venue → `geo: null` at ripper level, geocode per
event location). Not found under `sources/`.
