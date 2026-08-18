---
name: "Kids Out and About Seattle"
status: candidate
platform: "Unknown (Drupal-based EntertainmentCalendar.com network site)"
url: https://seattle.kidsoutandabout.com/
tags: [Family]
firstSeen: 2026-08-17
lastChecked: 2026-08-17
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
