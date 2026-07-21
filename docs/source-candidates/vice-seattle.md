---
name: VICE Seattle
status: added
pr: 993
platform: Booketing (UrVenue)
url: https://booketing.com/microsite/vicesea/events/2786/1495647/vice-seattle
tags: [Music, Nightlife, Capitol Hill]
firstSeen: 2026-07-21
lastChecked: 2026-07-21
---

Capitol Hill nightclub at 1532 Minor Ave, Seattle, WA 98101.
Squarespace site has empty events collection (itemCount: 0), but venue uses
**Booketing/UrVenue** (booketing.com) for ticketing and event management.
The booketing events page renders a server-side HTML calendar table with
61 events from July 21 through September 26, 2026.

## Booketing URL Pattern

- Events page: `https://booketing.com/microsite/vicesea/events/2786/1495647/vice-seattle`
- Individual event: `https://booketing.com/microsite/vicesea/event/2786/1495647/{slug}?eventcode={CODE}`
- Event codes: `EVE149564700020{YYMMDD}` (e.g., `EVE149564700020260724` = Jul 24, 2026)

## HTML Structure

Events are in table cells: `<td class='uvtddate-YYYY-MM-DD uvsingleevent'>`
Each cell has a link to the individual event page with slug and eventcode.
Event titles are the URL slugs (e.g., `white-rabbit-group-fridays`, `shake-saturdays`).

## Recurring Events

- **Two Dollar Tuesdays** (weekly) - DJ + cash beer pong tournament
- **WYD Wednesdays** (weekly)
- **White Rabbit Group Fridays** (weekly) - Electronic music
- **SHAKE Saturdays** (weekly) - Vegas-style DJ sets
- Various one-off events (Tech It, Club Bahay, Lost & Found, Dilly Disco)

## Ripper Approach

Custom HTML ripper that fetches the booketing events page and parses the
calendar table cells. Each `<td class='uvsingleevent'>` contains date,
event slug, and link to individual event page. Event detail pages have
full title, time (9:30pm), and venue address.