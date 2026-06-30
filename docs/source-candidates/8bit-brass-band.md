---
status: investigating
firstSeen: 2026-06-30
lastChecked: 2026-06-30
---

8-Bit Brass Band is a Seattle-based brass band known for performing video game music and appearing at sci-fi/gaming conventions, community festivals, and local venues. They maintain an event calendar on their Wix website at https://www.8bitbrassband.com/event-list.

**Website:** https://www.8bitbrassband.com  
**Instagram:** @8bitbrassband  
**Platform:** Wix Events

## Investigation

The Wix site does not expose events via warmup data (all JavaScript-loaded), but each event detail page includes `<script type="application/ld+json">` with full Schema.org Event data including startDate, endDate, location address, and image.

A sitemap at https://www.8bitbrassband.com/event-pages-sitemap.xml lists all published event pages. The ripper fetches the sitemap, then fetches each event page to extract JSON-LD. Seattle/WA events are included; events with explicit non-WA state addresses (OR, TX, LA, etc.) are filtered out.

As of 2026-06-30 all currently published events are past dates. The band's Summer 2026 tour (Nectar Lounge 07/30, UHeights Popup 08/08, announced via Instagram) has not yet been published to their website. The ripper is ready; PR will pass CI once the band updates their site.

## Seattle events (historical from sitemap)
- HONK! Fest West (multiple years) — Seattle
- Nectar Lounge Brass Band Extravaganza — Nectar Lounge, Fremont
- Bit Brigade / Mega Man X LIVE — The Crocodile, Belltown
- Cap Hill Busk w/ Bad Weather Brass — Capitol Hill
- Katamari Daybreaks Rave outside PAX West — Seattle Convention Center area
- Geek Girl Con busk — Seattle Convention Center
- SakuraCon busk — Washington State Convention Center
- ECCC busking — Seattle Convention Center
- Rat City Roller Derby — Magnuson Park Hangar 30
- HONK-o-ween on Cap Hill — Capitol Hill
- Halloween Pet Parade at Volunteer Park — Volunteer Park, Capitol Hill
- Walk Don't Run - Art Walk Marathon — Belltown
- OUTLAND: The Glitch Ritual — 2322 2nd Ave, Seattle

## Tags
`["Music"]`
