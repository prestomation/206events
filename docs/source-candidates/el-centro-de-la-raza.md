---
name: "El Centro de la Raza"
status: added
firstSeen: 2026-05-08
lastChecked: 2026-06-01
---
**El Centro de la Raza** — `https://www.elcentrodelaraza.org/events/` — Tags: Community, Beacon Hill

Probed 2026-05-16: SiteGround CAPTCHA (`sg-captcha: challenge`, HTTP 202) on every request — same block as Central Saloon and Visit Pioneer Square. Cannot access events from sandbox or CI IPs.

Re-probed 2026-06-01: ICS endpoint (`/events/?ical=1`) returns HTTP 200 with `Content-Type: text/calendar` from the Claude Code web session (residential-like IP) — 9 upcoming June 2026 events. However, build server IPs receive HTTP 403, confirming SiteGround block applies to CI/datacenter IPs. Added with `proxy: outofband` so the out-of-band residential-IP runner fetches the ICS and the main CI build downloads from S3.

Escalated 2026-06-07: Out-of-band residential IP also receives HTTP 403 (3 consecutive failures). Promoted `proxy: outofband` → `browserbase` — Browserbase executes JS and bypasses SiteGround CAPTCHA where plain HTTP cannot.
