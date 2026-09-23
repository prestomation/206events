---
name: New Seattle Waterfront
status: notviable
platform: Unknown
url: https://newseattlewaterfront.org/whats-happening
tags: [Community, Waterfront]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr:
---

Seattle waterfront redevelopment project events and community programming along the new waterfront.

**Findings (2026-08-14):** Blocked. Direct fetch (curl, browser UA) returns a bare HTML
shell with a meta-refresh to `/.well-known/sgcaptcha/?r=%2Fwhats-happening...` — a
SiteGround JS/CAPTCHA challenge. Would need a proxy/browser-executing fetch to evaluate
further. This is Friends of Waterfront Seattle's public-programming arm for the new
waterfront park — plausible real Seattle source if unblocked.

**Re-checked 2026-09-23:** Still behind a SiteGround `sgcaptcha` JS challenge (HTTP 202 + meta-refresh). Closing as notviable regardless: the new waterfront park's public programming is already covered by the existing `waterfront-park` source (`sources/waterfront_park/`, Friends of Waterfront Park at waterfrontparkseattle.org/events), so this would be a duplicate listing of the same events.
