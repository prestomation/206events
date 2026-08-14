---
name: Lawless Forge Seattle
status: candidate
platform: Checkfront
url: https://lawlessforge.com/seattle
tags: [Creation]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Seattle blacksmithing and blade-forging studio offering hands-on knife-making experiences.

**Findings (2026-08-14):** WordPress site (direct fetch needed a browser UA — default
WebFetch got a 403, likely WP Rocket/bot-check false positive; plain curl with a UA got 200).
The `/seattle/blacksmithing-classes/` page embeds a **Checkfront** booking widget at
`lawless.checkfront.com/reserve/` (category_id params for different class types), plus
sibling locations `lawless-forge-marysville.checkfront.com` and
`lawless-forge-sterling.checkfront.com`. This is open-ended session/experience booking
(book-anytime class slots) rather than a curated calendar of dated public events — no public
ICS feed found on Checkfront. Would likely need to be modeled as recurring bookable sessions
rather than one-off events, similar to an escape-room/experience business.
