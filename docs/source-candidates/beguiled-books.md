---
name: Beguiled Books
status: candidate
platform: Custom HTML (Wix)
url: https://www.beguiledbooks.com/events
tags: [Books, Pioneer Square]
firstSeen: 2026-08-06
lastChecked: 2026-08-06
pr:
---

Seattle's newest independent bookstore (opened a physical location fall
2025), romance-genre specialty, 109 1st Ave S, Pioneer Square.

Built on Wix, but the `/events` page is server-rendered — a plain
`curl` fetch returns event titles/dates in the raw HTML ("Bookstore
Romance Day," "Starlight Soiree," author signing slots), not a
JS-only shell. Custom HTML scraping is viable; not a one-off, ongoing
event programming.

🔴 Low confidence (requires custom scraper, no built-in Wix ripper
type) but the repo has precedent for custom HTML sources.
