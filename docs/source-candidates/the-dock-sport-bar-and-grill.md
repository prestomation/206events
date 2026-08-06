---
name: The Dock Sport Bar & Grill
status: candidate
platform: Custom HTML (SpotHopper) or hand-authored recurring
url: https://fremontdock.com/seattle-fremont-the-dock-sport-bar-and-grill-events
tags: [Trivia, Nightlife, Fremont]
firstSeen: 2026-08-06
lastChecked: 2026-08-06
pr:
---

Fremont sports bar with recurring weekly trivia (Thu) and karaoke
(Thu/Fri/Sat). Not part of the existing HeadInTheCloudsTrivia network
(`sources/headinthecloudstrivia`) already covered elsewhere in the repo.

Built on the SpotApps/SpotHopper restaurant platform — a plain `curl`
fetch confirms server-rendered event markup (`event-time`,
`event-add-to-calendar`, `event-info-text` classes), with 13+ "Karaoke"
and 7+ "Trivia" mentions in the raw HTML.

Since the schedule looks like fixed weekly slots (not one-off dated
events), this may be a better fit as a hand-authored
`sources/recurring/` entry (pattern matches
`sources/recurring/admiral-pub-trivia.yaml`) than a custom scraper —
worth deciding at implementation time by checking whether the page ever
lists exceptions/cancellations that a static recurring schedule would
miss.

🔴 Low confidence (custom scraper or recurring YAML, not a built-in
type) but confirmed weekly programming.
