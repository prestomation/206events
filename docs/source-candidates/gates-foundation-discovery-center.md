---
name: "Gates Foundation Discovery Center"
status: candidate
platform: WordPress (custom `event` post type)
url: https://www.discovergates.org/events/
tags: [Community, QueenAnne]
firstSeen: 2026-08-10
lastChecked: 2026-08-10
---

Free public museum/exhibit space at 440 5th Ave N, Seattle (Seattle Center
area), operated by the Gates Foundation. Public tours, staff chats, and
occasional public events (e.g. the December "Giving Marketplace").

Investigated 2026-08-10:
- Site is WordPress (`wp-content/uploads` asset paths, `wp-json/` REST API present)
- Custom REST post type discovered: `https://www.discovergates.org/wp-json/wp/v2/event`
- Fetched directly — `x-wp-total: 0`, zero events currently published in the
  `event` post type
- Also has custom `exhibits` and `location`/`event_type` taxonomies, but no
  events content live at time of check
- No ICS/iCal feed found

**Verdict**: Not yet implementable — real REST endpoint exists (would be a
clean custom-JSON ripper if populated), but it returns 0 events right now.
Re-check `wp-json/wp/v2/event?per_page=10` next cycle; implement once it
returns upcoming events.
