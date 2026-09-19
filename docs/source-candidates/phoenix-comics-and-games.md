---
name: "Phoenix Comics and Games"
status: candidate
platform: Shopify (products.json, event tickets sold as products)
url: https://shop.phoenixseattle.com/collections/events/products.json
tags: [Gaming, "Capitol Hill"]
firstSeen: 2026-09-19
lastChecked: 2026-09-19
---

Comic/game shop at 113 Broadway E, Seattle, WA 98102 (Capitol Hill). Sells
tickets to weekly Magic: The Gathering event nights (Friday Night Magic
Draft, Tuesday Night Draft) and irregular prerelease/sealed events as
Shopify products in the `events` collection.

Investigated 2026-09-19:
- Confirmed Shopify storefront; `https://shop.phoenixseattle.com/collections/events/products.json?limit=50`
  returns 200 with real, current event-ticket products (`product_type: "Special Event"`).
  4 upcoming at time of check: "Friday Night Magic Draft - The Hobbit | September 18 ticket",
  "Tuesday Night Draft - Chaos Draft | September 22 Ticket", and two
  "Reality Fracture Prerelease Flight" sealed events. Page 2 is empty —
  the collection only ever holds near-term events (Saltstone-style
  rolling window, not a deep backlog).
- Pattern is a **recurring weekly program**, not a one-off: Friday Night
  Magic and Tuesday Night Draft post a fresh dated product every week
  (SKUs `MTGFNM<mmddyy>` / `MTGTNM<mmddyy>`), so volume should stay
  non-zero going forward even though only 2 of the 4 current products
  have a parseable date.
- **Date is in the title** for the two weekly-series products (`"...| September 18  ticket"`,
  `"...| September 22 Ticket"` — note inconsistent capitalization/spacing
  of "ticket" and no year, same shape as the Saltstone Ceramics ripper's
  title-parsing). The two "Prerelease Flight N" products have **no date
  anywhere** in title or `body_html` — only "check out our prerelease
  guide over on the store blog" — so those would need to stay `ParseError`
  or be resolved via the uncertainty cache once a source page with the
  actual date is found.
- **No start time anywhere in the feed** for any product (title or
  `body_html`) — unlike Saltstone, which has full "6:30pm - 8:30pm" in
  every title. A casual web search suggests FNM starts around 6pm and
  Tuesday Night Draft around 6:30pm, but that's not confirmed from a
  Phoenix-owned source (no page text, no JSON-LD, no ICS), so it does
  **not** clear the bar to hardcode — it would need to go through the
  Event Uncertainty System (`UncertaintyError` per event, resolved by
  `skills/event-uncertainty-resolver` from a page/call that actually
  states the time) rather than being guessed at implementation time.
- **Verdict**: 🟡 Medium confidence — pipeline is real and the two weekly
  series will keep producing dated events, but doing this correctly means
  building the same title-date-parsing regex as Saltstone Ceramics *and*
  wiring the event-uncertainty system for start time on every event (not
  just an occasional gap), which is a bigger lift than a typical new
  source. Good next-cycle pick; not implemented this cycle so the time
  question can be resolved properly first rather than guessed.
- Not religious; Seattle-focused (single Capitol Hill location); not
  found under `sources/`.
