---
name: "Jack Straw Cultural Center"
status: blocked
platform: WordPress / Wicked Event Calendar (JS-rendered)
url: https://www.jackstraw.org/events/
tags: [Arts, Music, Education]
firstSeen: 2026-06-21
lastChecked: 2026-06-21
---

Seattle audio arts organization (4261 Roosevelt Way NE, University District) — media gallery exhibitions, audio residencies, podcasting and audio editing workshops, the Jack Straw Writers Program, and gallery openings. Year-round programming.

Investigated 2026-06-21:
- WordPress site confirmed (nginx with WordPress x-redirect-by header)
- Events calendar uses **Wicked Event Calendar** plugin (not Tribe Events)
- Calendar renders entirely client-side via JavaScript — server-side HTML fetch returns empty event divs with CSS class `wicked-events` but no event content
- ICS export: none found (Wicked Event Calendar does not provide a standard ICS export URL)
- No `application/ld+json` event schema data on individual event pages
- Has both in-person events (gallery openings, writer readings) and online workshops; in-person events relevant to 206.events
- July 2026: 59+ events loaded client-side (workshops, residency events, gallery shows, community readings)

**Verdict**: Blocked — JS-rendered calendar requires browser execution. Would need `proxy: "browserbase"` + a custom IRipper that parses Wicked Event Calendar HTML. Medium-effort implementation; revisit if volume and in-person event ratio justify the work.
