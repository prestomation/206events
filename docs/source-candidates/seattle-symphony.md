---
name: "Seattle Symphony"
status: investigating
platform: Tessitura (Sitecore site, JS-rendered calendar)
url: https://www.seattlesymphony.org/concerttickets/calendar
tags: [Music, Classical, Downtown]
firstSeen: 2026-06-07
lastChecked: 2026-06-07
---

Seattle Symphony at Benaroya Hall (200 University St, Downtown). Major
classical / film-with-orchestra venue, **not currently covered** by any ripper,
external feed, or aggregator (verified 2026-06-07 against published
`manifest.json` / `events-index.json`: only a generic events12 "Classical
music" stub and a one-off Seattle Wind Symphony event via seattle-gov — no
Seattle Symphony source).

**Investigation (2026-06-07):**
- `https://www.seattlesymphony.org/concerttickets/calendar` returns HTTP 200
  with a real browser User-Agent (~1.3 MB), but 403s a generic UA — CI may need
  a browser UA or proxy.
- The page is **Sitecore + JS-rendered**; the event list is loaded client-side.
  No event data, no JSON-LD (`application/ld+json`), no `.ics`/RSS, and no API
  base path are present in the static HTML.
- Ticketing SDK loaded from `cds-sdkcfg.onlineaccess1.com` → **Tessitura**
  (onlineaccess1.com is a Tessitura/AudienceView hosted-checkout domain). No
  public iCal/JSON feed discovered.

**Blocker:** the calendar's event data comes from a Tessitura-backed XHR/API
that isn't visible in the static HTML. Finding the endpoint needs
browser-devtools network inspection (or the venue's Tessitura REST/"TNEW" API
base), which couldn't be done from this environment. Not implementable until
that endpoint is identified.

**Next steps:** inspect the calendar page's XHR calls in a browser to capture
the Tessitura events endpoint (commonly a `/api/.../PerformanceSearch` or
EpsilonAPI/`tnew` JSON call). Once a JSON endpoint returning future
performances is confirmed, implement as a custom `JSONRipper`. If the only
working access is browser-rendered, escalate via the proxy ladder
(outofband → browserbase) per `skills/proxy-escalation/`.

Surfaced 2026-06-07 from a poster-board photo (source-from-event): a "Top Gun
in Concert" poster (film-with-live-orchestra, a Seattle Symphony format) on a
community kiosk.
