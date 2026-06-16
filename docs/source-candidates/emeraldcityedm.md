---
name: "EmeraldCityEDM"
status: notviable
platform: Google Calendar (private)
url: https://www.emeraldcityedm.com/
tags: [Music, EDM]
firstSeen: 2026-06-16
lastChecked: 2026-06-16
---
**EmeraldCityEDM** — `https://www.emeraldcityedm.com/` — Seattle EDM event listing site covering electronic dance music events in the Seattle area.

Investigated 2026-06-16:
- Site embeds a Google Calendar widget for event listings
- Attempted to fetch the ICS from the embedded Google Calendar; returned HTTP 200 with `content-length: 0`
- The Google Calendar is private (not publicly accessible via ICS)
- No alternative machine-readable calendar format found

**Verdict**: Not viable — Google Calendar is private; cannot fetch ICS. Would require scraping the HTML event listing which is low-confidence and fragile.
