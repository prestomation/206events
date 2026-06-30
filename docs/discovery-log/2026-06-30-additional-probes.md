## Source discovery: Arts institutions, community venues, cultural orgs

Extended discovery probe across Seattle arts institutions, breweries, community orgs, dance venues, and cultural centers. System coverage is extremely comprehensive (~308 candidate files, 130+ implemented sources). Most previously unchecked organizations are either DNS-error, HTTP 403, use proprietary platforms (ARTdynamix, Tessitura, Acuity, Arryved), or returned empty Squarespace feeds.

### New candidates added

- 🔄 Candidate: Center for Wooden Boats (`cwb.org`) — Squarespace site, 1 upcoming event confirmed (Dinner on the Docks July 23, 2026, 50th Anniversary season). Standard Squarespace JSON endpoint (`?format=json`) returns empty — non-standard events setup; may use embedded calendar widget. Low event volume currently; monitor for fall programming. `docs/source-candidates/center-for-wooden-boats.md`
- ❌ Not viable: Gage Academy of Art (`gageacademy.org`) — ARTdynamix® by Dream Warrior Group (proprietary platform, not integrable). `/calendar/` is JS-rendered. `docs/source-candidates/gage-academy-of-art.md`
- ❌ Not viable: Pratt Fine Arts Center (`pratt.org`) — ARTdynamix® + Canvas proprietary platform (same as Gage). `/events` 404. `docs/source-candidates/pratt-fine-arts-center.md`

### Existing candidates re-checked

- 🔄 CoCA Seattle: Still 0 upcoming events as of 2026-06-30. Monitor for fall 2026 programming.
- 🔄 Rat City Roller Derby: 2026 season complete (Season 20 Championships Apr 18; WFTDA Playoffs May 15–16). Platform issue unchanged (Tribe Events ICS disabled). Re-check when 2026–27 bout season announced (September).

### Probes returning no data / not viable

- MOHAI (`mohai.org`) — already implemented at `sources/external/mohai.yaml`
- Washington Ensemble Theatre — DNS not found
- Northwest Folklife community calendar — proprietary CMS, only 3 multi-year recurring entries (not specific dated events)
- Gay City Seattle (`gaycity.org`) — Acuity Scheduling (appointments, not public events)
- Ingersoll Gender Center — no public event calendar found
- Center for Wooden Boats `?format=json` — empty response (non-standard Squarespace setup)
- Holy Mountain Brewing — Arryved platform, 0 upcoming events
- Lowercase Brewing — HTTP 403
- Flying Bike Cooperative Brewery — members-only events access
- Langston Hughes Cultural Society (`langstonseattle.org`) — empty response
- Rainier Beach Action Coalition — DNS not found
- Community Roots Housing / Capitol Hill Housing — redirects to communityrootshousing.org, no calendar
- Filipino Community Center (`filipinocommunity.org`) — domain for sale
- Korean American Community WA — DNS not found
- Ethiopian Cultural Center of WA — DNS not found
- Erickson Theatre (`ericksontheatre.com`) — under construction, no events
- Discovery Park (`discoverypark.org`) — domain for sale
- Seattle Pinball Museum (`seattlepinballmuseum.com`) — 404
- Northwest Outdoor Center (`nwoc.com/events`) — 404
- Seattle Design Festival (`seattledesignfestival.org`) — site compromised (SEO spam)
- Meaningful Movies Seattle (`meaningfulmovies.org`) — empty response
- Highline Seattle (`highlineseattle.com`) — 404
- Milepost 5 (`milepost5.com`) — DNS not found
- Seattle Children's Museum — HTTP 503
- Second Story Repertory — DNS not found
