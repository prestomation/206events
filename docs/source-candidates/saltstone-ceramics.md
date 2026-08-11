---
name: "Saltstone Ceramics"
status: added
platform: Shopify (custom scrape — no built-in Shopify ripper type exists yet)
url: https://saltstoneceramics.com/
tags: [Arts, Wallingford]
firstSeen: 2026-08-05
lastChecked: 2026-08-11
pr: 1179
---

Previously logged `❌ Not Viable` on 2026-07-01 ("Shopify booking
storefront, no discrete dated-event data") — re-evaluated this cycle
with a closer look at the raw `/products.json` payload rather than the
storefront UI, and the schedule data does exist, just embedded in
product titles rather than a structured field. Reopening as a
candidate on that basis.

Ceramics studio in Wallingford. `/products.json` returns HTTP 200 with
50 products (confirmed via `curl`). The catalog is a mix of:

- Multi-week class series with the schedule baked into the title text,
  e.g. `"Fall Beginner Wheel: Wednesday Evenings, 6:30pm - 9:30pm,
  September 9th - October 28th"` (tag `class`, `adult-8-week`)
- Plain retail merchandise (mugs, bud vases, trays) that is not an event
  at all

Implementing this requires a **custom JSON scraper**, not the generic
Shopify pattern used elsewhere in the repo (no `shopify` ripper `type`
currently exists in `lib/config/`) — need to:
1. Filter to products tagged `class`/`workshop` (skip plain merch)
2. Parse the day-of-week + time range + start/end date out of the title
   string (no structured `event.start`/`event.end` fields in the Shopify
   product schema)
3. Decide whether a multi-week class series becomes one calendar entry
   or a recurring weekly entry for the series' date range

🟡 Medium-tier data source (Shopify `/products.json` confirmed live),
🔴 Low-tier effort (custom title parsing, class/merch filtering). Worth
implementing next cycle — Wallingford doesn't have many dedicated
sources yet.

Implemented 2026-08-11: added `sources/saltstone_ceramics/` (custom
`JSONRipper` subclass, filtering `product_type === "retail-class"`).
Title parsing handles three observed date shapes (cross-month range,
same-month day range, single date) plus an optional weekday token.
Multi-day/multi-week listings expand into **one event per actual
occurrence** (not a single RRULE event) — filtering by weekday when
stated, otherwise every calendar day for short spans (≤6 days) or
weekdays-only for longer spans (camps/intensives), matching every
example observed in the live catalog. Per-event `cost` (from
`variants[0].price`, or `soldOut: true` when the variant is
unavailable) and `imageUrl` (from `images[0].src`) come straight from
the Shopify payload — no uncertainty/photo-gap queue needed.
`ONLY_SOURCE` build confirmed 82 events, 0 errors, 0 unparseable
titles against the live fixture.

Note: while testing, discovered that the shared ICS TZID post-process
in `lib/config/schema.ts` (~line 445) mis-assigns `DTSTART` when a
calendar mixes `rrule` and non-`rrule` events (the non-global
`ics.replace` matches by document position, not by event identity, and
the underlying `ics` library appears to reorder VEVENTs by date). An
earlier draft of this ripper used `rrule` for the multi-session
listings and produced visibly wrong dates once mixed with the
single-session `Clay Curious` events. Worked around by not emitting
`rrule` at all (per-occurrence events instead) — every existing
`rrule` producer (`lib/config/recurring.ts`) happens to emit 100%
`rrule` events per calendar, which is presumably why this hasn't
surfaced before. Flagging for a follow-up fix to the shared ICS writer
rather than fixing it in this PR.
