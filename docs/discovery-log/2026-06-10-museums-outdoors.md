## Source discovery: Museums / Outdoors / Tech / Multicultural / Film / Dance

Dead source check: Script returned HTTP 403 from deployed site (known infrastructure issue). No dead sources confirmed.

### Searches conducted

1. **Film** — SIFF already covered (`siff`). Theatre Puget Sound (theatrepugetsound.org) has ICS subscription options but is behind SiteGround captcha (sg-captcha: challenge) — blocked.

2. **Outdoor recreation** — Seattle Center summer programming already covered. Cascade Bicycle Club uses Drupal 10 with no ICS feed. Northwest Trail Runs (nwtrailruns.com) uses WordPress with no ICS export; has many Seattle-area races (Woodland Park, Carkeek, Seward Park, Interlaken) but no machine-readable feed.

3. **Tech community** — GeekWire already covered. New Tech Northwest (luma.com/newtech) uses Luma with no public ICS subscription.

4. **Multicultural** — Seattle Center Festál already covered (`seattle_center_festal`). JCCCW already covered (`jcccw`).

5. **Dance** — Century Ballroom Roadshow (`century-ballroom.md`) already marked notviable (Modern Events Calendar MEC plugin, REST API returns empty array). Swing Dance SCT and Swing It Seattle already notviable (Squarespace non-events pages). SeattleDances already covered (`external/seattledances`).

6. **Comedy / improv** — Unexpected Productions already covered (`unexpected_productions`). Emerald City Comedy (`emerald_city_comedy`) already covered.

7. **Literary / arts** — Seattle Arts and Lectures (lectures.org) uses WordPress with no Tribe Events plugin; custom post types are programs, not events. Not viable as scraped source.

8. **Museums / cultural** — **Found Seattle Aquarium on Eventbrite** (organizer `16503646468`). Not previously covered. 5 upcoming After Hours evening events confirmed via Eventbrite web UI.

9. **Neighborhood arts** — Georgetown Art Attack (`gba-georgetown`) already covered (disabled, Tribe Events). South Park Business District (southparkbusinessdistrict.com) is Squarespace events-stacked with only 1 upcoming event (SOPASUPA + RIVER FEST, Aug 8). Low volume, monitoring.

10. **Status checks** — CoCA Seattle: still 0 upcoming events. RailSpur Seattle: still 0 Eventbrite events. Seattle Creative Social: still 0 Squarespace events. Theatre Puget Sound: blocked (SiteGround captcha).

### Candidate file updates

| Candidate | Status | Notes |
|-----------|--------|-------|
| Seattle Aquarium | `investigating` → `added` | Eventbrite organizer `16503646468` found; 5 events confirmed |
| Theatre Puget Sound | New `blocked` entry | SiteGround sg-captcha blocks all fetch attempts |

### Implementation

Implemented **Seattle Aquarium** as `sources/seattle_aquarium/ripper.yaml` using the built-in `eventbrite` type:
- Eventbrite organizer ID: `16503646468`
- 5 upcoming After Hours events (adult evening experiences, ~$55-61)
- Location: 1483 Alaskan Way, Pier 59, Seattle, WA 98101 (downtown waterfront)
- Tags: Museums, Downtown
- `defaultDurationHours: 3`
- Geo: lat 47.6076248, lng -122.3432202 (OSM relation 16051213)
- EVENTBRITE_TOKEN required in CI (not verifiable in web environment)

---

- ✅ Added: Seattle Aquarium — Eventbrite (organizer `16503646468`) — 5 events — https://www.eventbrite.com/o/seattle-aquarium-16503646468
- 🔄 Status fix: Seattle Aquarium — `investigating` → `added` (Eventbrite organizer found)
- ❌ Not viable: Theatre Puget Sound — blocked (SiteGround sg-captcha on all fetch attempts)
- 💡 Candidate: South Park Business District — Squarespace events — 1 upcoming event (SOPASUPA + RIVER FEST Aug 8); monitoring for more events
- 💡 Candidate: Northwest Trail Runs — WordPress, no ICS feed; Seattle-area races at Woodland Park, Carkeek, Seward Park — needs custom HTML scraper
