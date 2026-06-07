---
name: "SeattleDances"
status: blocked
firstSeen: 2026-05-08
lastChecked: 2026-06-07
---
Implemented as `sources/external/seattledances.yaml` with `proxy: outofband`. ICS feed at `?post_type=tribe_events&ical=1&eventDisplay=list` returns TLS errors from the sandbox; outofband proxy confirms 30+ events. Tags: Dance, Arts.

2026-06-07: Browserbase 3× HTTP 402 (Payment Required) — proxy ladder exhausted. **Note: the source website is not blocking us; this is a Browserbase API billing failure.** Source disabled pending Browserbase account resolution. Consider re-enabling if Browserbase billing is restored.
