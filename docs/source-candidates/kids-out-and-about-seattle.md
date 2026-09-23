---
name: "Kids Out and About Seattle"
status: notviable
platform: "Unknown (Drupal-based EntertainmentCalendar.com network site)"
url: https://seattle.kidsoutandabout.com/
tags: [Family]
firstSeen: 2026-08-17
lastChecked: 2026-09-23
---

Regional franchise site of the EntertainmentCalendar.com / KidsOutAndAbout.com
network (multi-city family-activities network, not Seattle-specific as a
company). Site returns HTTP 200.

Investigated 2026-08-17:
- No `/calendar` path (404). Homepage links are mostly evergreen
  `/content/<slug>` articles (camp guides, "corn mazes near Seattle",
  "escape rooms near Seattle") rather than a dated events collection —
  content-marketing structure, not a calendar feed.
- No RSS/iCal link found on the homepage despite "rss"/"ical" strings
  appearing in page boilerplate (footer/share-widget text, not actual feed
  links).
- 🔴 Low confidence — would need a deeper crawl to find whether a genuine
  dated-events listing exists anywhere on the site; on this pass it reads
  as an article/guide site rather than an events calendar. Leaving as
  `candidate` for a follow-up look rather than marking not-viable outright.

**Closed 2026-09-23 (notviable):** Found a real dated listing at `/event-list/YYYY-MM-DD` (HTML only; `/rss.xml` returns 403, no ICS/JSON). Sampled 2026-09-26: ~36 listings, only ~10 in Seattle city, and those are almost all venues already covered by dedicated sources (Museum of Flight, MoPOP, MOHAI, Burke, Chihuly, Taproot, Lumen Field); the rest are Issaquah/Shoreline/Snohomish or national sponsored promos (e.g. a New York photo-studio ad). Entries carry long multi-date lists and one page per day, so it would need a fragile custom scraper. Regional franchise aggregator with little unique Seattle coverage: not worth an HTML ripper.

**Re-evaluated 2026-09-23 (King County rule):** Issaquah/Shoreline listings are now in scope, but the other reasons for closing still apply. It is a franchise aggregator with only an HTML one-page-per-day listing (`/event-list/YYYY-MM-DD`), `/rss.xml` returns 403, and there is no ICS or JSON. Entries have long multi-date lists, most in-area items are venues we already cover (Museum of Flight, MoPOP, MOHAI, Burke, etc.), and some are national sponsored promos. Still not worth a fragile scraper.
