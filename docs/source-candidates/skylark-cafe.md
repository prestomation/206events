---
name: "Skylark Café & Club"
status: added
platform: Webflow (custom HTML scraper)
url: https://www.skylarkcafe.com/calendar
tags: [Music, "West Seattle"]
firstSeen: 2026-05-08
lastChecked: 2026-05-28
pr: pending
---
Music venue and bar at 3803 Delridge Way SW, Seattle (Delridge/West Seattle). Hosts live concerts, drag shows, open mics, and trivia nights. Webflow CMS site — events rendered server-side in `.collection-item-3.w-dyn-item` divs. Date format: "May 28, 2026 8:00 PM".

Previously flagged `notviable` 2026-05-16 (no ICS, no single Eventbrite organizer). Re-investigated 2026-05-28: server-side Webflow rendering is stable and parseable with CSS selectors. 6 upcoming events confirmed (May–June 2026). External ticket links captured when present (Eventbrite, external event sites, etc.).

Implemented 2026-05-28 as custom `IRipper` HTML scraper.
