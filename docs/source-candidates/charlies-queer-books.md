---
name: "Charlie's Queer Books"
status: investigating
platform: BookManager (custom POS/CMS, React SPA)
url: https://charliesqueerbooks.com/events
tags: [Books, Fremont]
firstSeen: 2026-07-10
lastChecked: 2026-07-10
---

Seattle's first dedicated queer bookstore in ~20 years, opened 2023 in
Fremont. Hosts a regular calendar of author readings, writing clubs, panels,
and a monthly Queer Silent Book Club (4th Friday).

Investigated 2026-07-10:
- Site runs on the BookManager platform (`cdn1.bookmanager.com`), a React
  SPA — the initial HTML has no server-rendered event data (`<div id="root">`
  only), so a plain fetch/HTML scrape returns nothing.
- Found the underlying data API by reading the bundled JS
  (`cdn1.bookmanager.com/shop/static/js/main.*.chunk.js`): event data is
  fetched client-side via `POST https://api.bookmanager.com/customer/event/getList?_cb=<san>`
  (`san` = `9932925` for this store) with a `multipart/form-data` body
  (`session_id`, `uuid`, `store_id`, `from`/`to` as `YYYYMMDD`).
- `session_id`/`uuid` appear to be arbitrary client-generated tracking
  values — the API accepted a made-up `session_id` — but `store_id` is
  validated server-side and returned `{"error":"invalid store_id"}` for a
  guess of `9932925` (the `san`/`_cb` value). The real `store_id` wasn't
  found in the static HTML/bundle; it's likely set at runtime from a
  separate `sitesettings`/init call this investigation didn't trace down.
- No ICS/RSS feed found on the site.

Not implementable yet — needs the correct `store_id` (probably discoverable
via a site-init API call or by inspecting live network traffic with a
browser) before the `event/getList` endpoint can be called directly. Worth
prioritizing on a future cycle: real, actively-used event calendar at a
genuinely new Seattle venue, just needs one more piece of reverse-engineering.
