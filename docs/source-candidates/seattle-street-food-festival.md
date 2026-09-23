---
name: "Seattle Street Food Festival"
status: notviable
firstSeen: 2026-06-07
lastChecked: 2026-09-23
tags: [Food, SouthLakeUnion, Community]
pr:
---
**Seattle Street Food Festival** — `https://206nightmarkets.com/street-food` — Seattle's largest independent street food festival, filling five city blocks of South Lake Union with 70+ food trucks, restaurants, and pop-ups plus live music.

Investigated 2026-06-07:
- 2026 dates confirmed: **August 22–23** (Saturday–Sunday) at 217 9th Ave N, South Lake Union
- Annual 2-day event every August, organized by Mobile Food Rodeo / 206 Night Markets
- Eventbrite organizer page (`6916683221`) shows 0 upcoming events currently; they may not post until closer to date
- No ICS feed found
- Recurring YAML feasibility: 2026 dates (Aug 22–23) are the 4th Saturday–Sunday of August; historical year-to-year pattern unclear — rove.me listed "June 2025" but other sources say late August. Verify dates before implementing as recurring.

Next steps: Confirm the date pattern across 2023–2025 before implementing as recurring YAML.

Re-checked 2026-07-22: Eventbrite organizer (`6916683221`) still shows
0 upcoming events. `206nightmarkets.com/street-food?format=json`
resolves to `collection.typeName: "page"` with `itemCount: 0` — a static
landing page, not a real Squarespace events collection. The dedicated
`seastreetfoodfest.com` domain doesn't resolve to a Squarespace JSON
endpoint either (`?format=json` returns plain HTML). No structured data
source found yet; still not implementable this cycle.

**2026-09-23 (notviable):** Re-checked. The 2026 edition (Aug 22-23) has concluded. The Eventbrite organizer `6916683221` has 0 live events, `206nightmarkets.com/street-food` is a static Squarespace page (its text is in images, with no dates in the markup), `/events?format=json` 404s, and there's no ICS. It's a single annual weekend with no published stable date pattern, so it's not suitable for recurring YAML. `seattle-night-market` (the same organizer) is already a disabled source.
