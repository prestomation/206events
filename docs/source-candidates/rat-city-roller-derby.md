---
name: "Rat City Roller Derby"
status: candidate
firstSeen: 2026-05-08
lastChecked: 2026-06-30
---
**Rat City Roller Derby** — `https://ratcityrollerderby.com/events/` — Tags: Community, Sports

Probe 2026-05-09: `?post_type=tribe_events&ical=1` returns HTML (not ICS) — Tribe Events ICS export disabled. Site is WordPress behind Cloudflare. Would need custom HTML scraper. Site is active with scheduled bouts.

Probe 2026-05-25: Events page returns "There are no posts to display." An RSS feed at `https://ratcityrollerderby.com/events/feed/` is accessible and contains events (WFTDA playoffs in Richmond CA, Cascadian Clash tournament events). Many events appear to be away games or tournament travel. Needs further investigation to confirm whether Seattle home-game events are surfaced in the RSS. Low priority until confirmed.

Re-checked 2026-06-30: The RSS feed confirms the 2026 season is complete — Season 20 Championships were April 18, 2026 and WFTDA Playoffs (Richmond CA) were May 15–16, 2026. No upcoming events visible in the feed. The platform issue (Tribe Events ICS disabled, would need custom scraper) remains unchanged. Re-check when the 2026–27 home-bout season is announced (typically September–October).
