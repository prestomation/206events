---
name: "Axe Kickers"
status: investigating
platform: Wix
url: https://www.axekickers.com/
tags: [Sports, Nightlife]
firstSeen: 2026-07-24
lastChecked: 2026-07-24
---
Competitive axe-throwing venue running IATF-sanctioned tournaments and a
regular "Axesquatch League" league-night format, plus casual throwing
sessions and team events. Found via a "Seattle axe throwing" search
(Seattle Throwdown Weekend 2026 — Marathon League Feb 12, Big Axe event
Feb 13).

Investigated 2026-07-24:
- Site confirmed as a Wix build (`static.wixstatic.com`/`static.parastorage.com` assets), with a `/events` page carrying `wix-events` widget markup and an `event-details-registration` link
- Wix isn't one of the built-in ripper types (ICS, Squarespace, Eventbrite, Ticketmaster, DICE, AXS, Shopify) — the events list on `/events` is rendered client-side by the Wix Events widget, so a plain HTTP fetch of the page returns the shell, not the event data
- Quick guesses at a public Wix Events API endpoint (`/_api/wix-events-web/rpc/query-events`, `/api/v2/events/query`) both 404'd — a working endpoint likely exists but needs proper discovery (browser network tab) or JS rendering, which wasn't done in this pass
- Not Seattle-proper confirmed yet — need to verify the throwing venue's address is within city limits before implementing

**Next step**: re-investigate with a browser/network trace to find the real Wix Events data endpoint, or fall back to custom HTML scraping if rendered markup is stable. Left as `investigating` rather than a confirmed 💡 candidate since the fetchable data shape hasn't been confirmed.
