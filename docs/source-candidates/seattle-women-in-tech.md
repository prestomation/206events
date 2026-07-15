---
name: "Seattle Women in Tech Consortium"
status: notviable
platform: Wix (JS-rendered SPA)
url: https://www.seattlewomenintech.org/events
tags: []
firstSeen: 2026-07-10
lastChecked: 2026-07-10
---

Community organization for women in tech in Seattle; runs networking events
and workshops.

Investigated 2026-07-10: Wix SPA (`static.parastorage.com`,
`static.wixstatic.com` assets). A plain fetch of `/events` returns a large
(1.1MB) HTML document, but grepping it for event data only turns up Wix's
own component CSS variable names (`eventTitleColorV2` etc.) — no
server-rendered event titles, dates, or a Wix Events widget data blob.
Same failure mode as `the-clay-corner.md`: needs headless-browser rendering
to confirm actual event content, which wasn't available in this environment
today (browser network requests hit `ERR_CONNECTION_RESET` through the
sandboxed proxy).

Not viable without a proxy/browser-rendering approach. Re-evaluate if the
org adopts a platform with server-rendered or API-accessible event data.
