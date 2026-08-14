---
name: CYC Seattle Racing
status: investigating
platform: Clubspot
url: https://cycseattle.theclubspot.com/racing
tags: [Playing-Sports, Sailing]
firstSeen: 2026-08-14
lastChecked: 2026-08-14
---

Corinthian Yacht Club Seattle racing schedule and sailing events.

**Checked 2026-08-14:** Real club, real platform (Clubspot — confirmed
"Powered by Clubspot" footer), but the racing page is a fully
JS-rendered Vue 3 single-page app backed by what looks like a Parse
Server (`/parse-sdk-js` script) — plain curl/WebFetch returns only the
app shell, no race data or dates. Would need a browser-executing fetch
or reverse-engineered Clubspot API endpoint to evaluate actual race
volume/dates. Left as `investigating`.
