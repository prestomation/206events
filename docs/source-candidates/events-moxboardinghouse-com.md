---
name: MtG | Weekly | Commander
status: notviable
platform: Occasion (individual ticketing/product pages, no listing endpoint)
url: https://events.moxboardinghouse.com/p/n/hQxndVnH
tags: ["board-games"]
firstSeen: 2026-08-25
lastChecked: 2026-08-28
---

Discovered via aggregator gap analysis. 2 events in the Seattle
metro sample. Source domain: events.moxboardinghouse.com.

Sample event: "MtG | Weekly | Commander" (2026-08-25T18:00:00.000Z)
Description: Weekly Commander format Magic: The Gathering all day at Mox Seattle.

**2026-08-28 investigation:** `events.moxboardinghouse.com` is Mox
Boarding House's white-labeled instance of the "Occasion" event
ticketing platform (Rails/Turbo app; `res.cloudinary.com/occsn/...`
image CDN, `_occasion_session` cookie) — confirmed via response
headers and `og:image` on the sample event page. Each event lives at
its own opaque, unguessable URL (`/p/n/<token>`); there is no public
listing/calendar endpoint (`/events` 404s) or JSON feed to enumerate
them. The parent Mox Boarding House Shopify page
(`moxboardinghouse.com/pages/seattle-events`) just embeds links to
these individual Occasion pages client-side. This is the same
underlying source already investigated and marked `notviable` under
`mox-boarding-house.md` and `mox-boarding-house-seattle.md` (Shopify
static page, no product feed) — no viable ripper path exists without
already knowing every event's token in advance.
