---
name: "Seattle Book Club"
status: investigating
platform: Shopify (custom events app, not products.json)
url: https://www.seattlebookclub.com/apps/events/calendar
tags: [Books]
firstSeen: 2026-07-10
lastChecked: 2026-07-10
---

Independent Seattle bookstore/shop. Runs author events and a local-author
spotlight program (`local_seattle_author_event`) alongside its retail catalog.

Investigated 2026-07-10:
- Confirmed Shopify (`cdn.shopify.com` assets), but `/products.json` only
  returns retail book inventory — no event data mixed in.
- The events calendar lives at `/apps/events/calendar`, a Shopify app page.
  The server-rendered HTML only contains unpopulated template placeholders
  (e.g. `${sourceEvent.location}`), confirming the actual event list is
  fetched and rendered client-side by the app's JS after page load — a
  plain HTML fetch returns no usable data.
- Did not find the underlying JSON endpoint the app calls (would need
  browser network-tab tracing; headless-browser probing in this environment
  hit `ERR_CONNECTION_RESET` through the sandboxed proxy, so this wasn't
  confirmed today).

Re-evaluate with browser-based network tracing to find the app's data
endpoint, or if the store ever exposes events through `/products.json`
(e.g. as a zero-cost "product") or a plain ICS/RSS feed instead.
