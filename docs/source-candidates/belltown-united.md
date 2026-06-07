---
name: Belltown United
status: notviable
platform: Squarespace (page-based, no Events collection)
url: https://www.belltownunited.org/events
tags: [Belltown]
firstSeen: 2026-05-28
lastChecked: 2026-06-07
pr:
---

Belltown neighborhood nonprofit / community organization. Runs a slate of
recurring annual community events: the **Belltown Mural Festival** (June),
the **Belltown Blast & Paint Jam** street festival (the mural-fest finale,
2nd Ave between Lenora & Battery + Bell St — free, all ages), **Belltown
Root Pie Day**, a summer outdoor film series, Belltown Night Out, etc.

Surfaced via two **source-from-event poster lookups**:
1. Instagram `@belltownblast` flier for the 2026 Belltown Blast, Sat Aug 15, 12pm–2am (May 2026).
2. Street poster for the 2026 **Belltown Mural Festival**, June 15–21, 2026 (June 2026).

Confirmed not currently covered in `events-index.json`, and no aggregator source (EverOut,
Do206) is in the project that would pick it up.

## Why notviable (no machine-readable feed)

Investigated the organizer's site as the branch-(e) source (public-street
festival → add the promoter, not the venue). The site is Squarespace but is
**not** backed by an Events collection:

- `https://www.belltownunited.org/events?format=json` returns a regular
  **Page** object (`collection.type: 10`) with empty `upcoming` / `items` /
  `past` arrays — not an Events collection (type 12). So the built-in
  `squarespace` ripper type cannot read it.
- The events shown on `/events` are hand-built promotional content blocks /
  buttons linking to individual pages (`/belltown-mural-festival`,
  `/root-pie-day`, `/paintjam-streetfest`, …). Each of those is itself a
  regular Page (type 10), not a dated event item. Dates live in prose
  ("June 15th–21st", "Coming back February 2027").
- No ICS / iCal / webcal feed, no "Subscribe" link, no public events API.

HTML scraping these promotional pages would be extremely fragile (free-form
prose dates, no stable structure) and isn't justified for a handful of
annual events.

The affiliated **Belltown Community Council** (belltown-cc.org) is
WordPress**.com**-hosted with no Events Calendar plugin — events are plain
blog posts under `/category/events/`, also without a structured feed.

## Possible future paths

- **EverOut Seattle** lists the Belltown Blast (and most of these events) with
  structured data. Adding EverOut as a general Seattle aggregator would cover
  this and much more, but that's a larger, separate effort — out of scope for
  a single-poster lookup.
- Revisit if Belltown United migrates `/events` to a real Squarespace Events
  collection (then the built-in `squarespace` type would work directly), or
  publishes an ICS feed.

Until then: the 2026 Belltown Mural Festival (June 15–21) and the 2026 Belltown Blast (Aug 15)
are **not covered** and there is no viable automated recurring source for the organizer.
