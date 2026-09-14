---
name: "U Wine Bar"
status: added
platform: "Crystal Commerce (product-catalog events page)"
url: https://www.uwinebar.com/catalog/events/12713
tags: [Gaming, Wallingford]
firstSeen: 2026-09-14
lastChecked: 2026-09-14
pr: 1467
---

Newly-opened board game / TCG wine bar at 4455 Stone Way N, Wallingford,
Seattle, WA 98103. Hosts Magic: The Gathering drafts, prereleases, and
craft nights (e.g. "Sip & Sculpt"), sold as ticketed "products" through a
Crystal Commerce storefront (`cc-client-assets.cdn.crystalcommerce.com`
asset CDN).

Investigated 2026-09-14:
- `https://www.uwinebar.com/catalog/events/12713` returns HTTP 200 with
  server-rendered HTML (no JS rendering needed) — each event is an
  `<li class="product" itemscope itemtype="http://schema.org/Product">`
  with a `title` attribute on the product link containing the date/time +
  event name as free text, e.g.
  `title="09/09/26 6:30pm Mystery Booster 1 Convention Edition Throwback Draft"`.
- No JSON API found (`/products.json` → 404, `.json` catalog suffix →
  415 Unsupported Media Type) — this is a custom HTML scrape, not a
  built-in ripper type (not Shopify/Squarespace/Wix).
- Confirmed **17 upcoming events** through Oct 31, 2026 at time of check —
  well above the minimum bar, spanning drafts, prereleases, and one
  non-TCG "Sip & Sculpt" craft event.
- Title text needs date/time parsing: `MM/DD/YY[ h:mmam/pm] <event name>`
  (some events, like the Sip & Sculpt keychain night, have no time in the
  title — would need an `UncertaintyError` for start time on those, or a
  reasonable default venue open time with uncertainty).
- Each event links to its own detail page
  (`/catalog/events/<slug>/<id>`) which likely has fuller description
  text — worth checking for a more precise time before falling back to
  uncertainty.
- 🔴 Low confidence tier (custom HTML scraper needed), but well-verified
  data with strong event volume. Not currently covered by any existing
  source.
