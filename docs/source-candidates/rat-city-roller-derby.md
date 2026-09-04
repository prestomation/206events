---
name: "Rat City Roller Derby"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-09-04
pr: 1366
---
**Rat City Roller Derby** — `https://ratcityrollerderby.com/events/` — Tags: Community, Sports

Probe 2026-05-09: `?post_type=tribe_events&ical=1` returns HTML (not ICS) — Tribe Events ICS export disabled. Site is WordPress behind Cloudflare. Would need custom HTML scraper. Site is active with scheduled bouts.

Probe 2026-05-25: Events page returns "There are no posts to display." An RSS feed at `https://ratcityrollerderby.com/events/feed/` is accessible and contains events (WFTDA playoffs in Richmond CA, Cascadian Clash tournament events). Many events appear to be away games or tournament travel. Needs further investigation to confirm whether Seattle home-game events are surfaced in the RSS. Low priority until confirmed.

Re-checked 2026-06-30: The RSS feed confirms the 2026 season is complete — Season 20 Championships were April 18, 2026 and WFTDA Playoffs (Richmond CA) were May 15–16, 2026. No upcoming events visible in the feed. The platform issue (Tribe Events ICS disabled, would need custom scraper) remains unchanged. Re-check when the 2026–27 home-bout season is announced (typically September–October).

Re-checked 2026-08-22: RSS feed (`lastBuildDate` Jul 6 2026) still tops out at
the July 18, 2026 fundraiser bout — no 2026–27 home season announced yet.
Platform issue unchanged. Re-check again in September/October per the prior
note.

**Implemented 2026-09-04 (PR #1366):** Season 21 is now live — `/events/`
lists 7 home bouts (Debut Brawl through Bout 6, Oct 2026–Apr 2027) plus a
3-day BIPOC Ultimate tournament they're hosting (Jan 29–31, 2027), 10 events
total. The `/events/` listing page itself (not the RSS feed, which is capped
at WordPress's default 10-post window and ordered by publish date rather
than event date) turned out to have plain server-rendered `a.event_link`
cards (`href="…/?post_type=event&p=<id>"`) that redirect to the pretty
per-event URL — no Cloudflare/JS-challenge issue after all, a plain fetch
with a browser UA works fine. Each detail page has clean, class-named
fields (`.event-date`, `.event-time`, `.event-location`) — no ICS/API
needed, straightforward `HTMLElement` scraping. Home bouts are all at
Southgate Roller Rink; the tournament is at Magnuson Park Hangar 30, so
implemented with `geo: null` and a small per-event venue-name → address
lookup table rather than a single ripper-level venue. Verified 10 events,
0 errors via `ONLY_SOURCE=rat-city-roller-derby`.
