---
name: "Open Books: A Poem Emporium"
status: candidate
platform: Shopify (static content page, not a product feed)
url: https://open-books-a-poem-emporium.myshopify.com/pages/events-calendar
tags: [Books, "Pioneer Square"]
firstSeen: 2026-06-10
lastChecked: 2026-07-29
---

Poetry-only bookstore in Pioneer Square, founded 1995 (`openpoetrybooks.com`,
Shopify-hosted). Hosts recurring readings/discussions: "Other People's Poems"
(monthly open-mic-adjacent reading series), "Poetry in Conversation" (monthly
book discussion), and one-off author readings/SAL co-presented events at Town
Hall Seattle.

The `/pages/events-calendar?format=json` endpoint returns HTTP 200, but it's
Shopify's generic **page** JSON (`{"page": {"body_html": "..."}}`), not the
`/products.json` shape the built-in `shopify` ripper type expects — this
store doesn't sell "products" as events. `body_html` is a single blob of
prose (month headers, then freeform date/description text per event, e.g.
"5/2 — Reading with jason b crawford & Abi Pollokoff"), not structured HTML
elements with consistent selectors.

🔴 Low confidence — would need a custom scraper parsing loosely-formatted
prose out of one `body_html` field (month sections, inconsistent date
formats "5/2" vs "May 2", not all entries have times/locations). Viable in
principle (real, dated, recurring, Seattle-focused events) but the parsing
is the hard part of this one, not the fetch. Worth a custom-ripper attempt
in a future cycle; not attempted this run.

Previously logged **not viable** twice before this per-file candidate
system existed: `docs/discovery-log/2026-06-10.md` ("Shopify static page,
no structured data, rate-limited") and `docs/discovery-log/2026-06-14.md`
("events listed as static pages, not products"). Re-opening as `candidate`
here is a deliberate reassessment, not an oversight — the site returns a
normal 200 (no rate-limiting observed this check) and, while still not a
built-in ripper type, a custom scraper over the one `body_html` field is a
concrete, buildable path that the earlier "not viable" verdicts didn't
spell out.
