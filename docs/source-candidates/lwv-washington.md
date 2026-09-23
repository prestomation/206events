---
name: League of Women Voters Washington
status: notviable
platform: Wild Apricot
url: https://www.lwvwa.org/events
tags: [Political]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr:
---

League of Women Voters Washington State events and civic engagement activities.

**Findings (2026-08-14):** Live, working calendar (footer: "Powered by Wild Apricot
Membership Software"). Confirmed upcoming events for August 2026 (MELD sessions, "Unite &
Rise for Voting Rights" pep rally and event, affinity-group meetings, Redistricting Reform
Task Force). Statewide org, not Seattle-specific, but includes Seattle-area civic events —
volume/relevance to a Seattle calendar should be double-checked (many entries look like
internal member meetings rather than public events) before implementing. No explicit ICS
link seen in the fetched content, but Wild Apricot generally supports calendar exports.

Re-checked 2026-09-16: confirmed the RSS feed at `https://www.lwvwa.org/events/RSS`
(linked from the events page) — a real, live feed with 111 upcoming items through
mid-October 2026 and beyond. However on inspection nearly every item is an internal
committee/affinity-group Zoom meeting (Treasurer Affinity Group, MELD pods, Data
Center Affinity Group, DEI Affinity Group, etc.) rather than a public community event,
and the org is statewide rather than Seattle-specific. Deprioritizing — poor fit for a
Seattle events calendar even though the feed itself is technically scrapable (RSS, not
ICS, so would also need custom parsing rather than the standard `external` ICS path).

**Re-checked 2026-09-23 (notviable):** Per the 2026-09-16 check, the Wild Apricot RSS feed works but is almost all internal committee and affinity-group Zoom meetings, and the org is statewide. Poor fit for a Seattle public-events calendar. Closing as notviable.
