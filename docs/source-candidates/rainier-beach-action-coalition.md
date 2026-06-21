---
name: "Rainier Beach Action Coalition"
status: notviable
platform: WordPress / Styled Calendar (JS-rendered)
url: https://www.rainierbeachactioncoalition.org/events
tags: [Community, "Rainier Beach"]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Rainier Beach Action Coalition (RBAC) is a community-led organization serving the Rainier Beach neighborhood. Hosts community meetings, advocacy events, cultural programming, and neighborhood improvement initiatives.

Investigated 2026-06-21:
- Website `rainierbeachactioncoalition.org` returned ECONNREFUSED (inaccessible from remote execution environment)
- Platform identified (from prior investigation) as WordPress with **Styled Calendar** plugin — a third-party calendar service that embeds via iframe/JavaScript
- Styled Calendar does not provide a public ICS export endpoint
- Calendar content is JS-rendered and embedded from an external service

**Verdict**: Not viable — Styled Calendar is an embedded third-party service with no public ICS export. No machine-readable calendar feed accessible.
