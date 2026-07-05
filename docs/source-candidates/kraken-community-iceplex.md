---
name: "Kraken Community Iceplex"
status: notviable
platform: DASH (rink booking system, JS widget)
url: https://www.krakencommunityiceplex.com/public-drop-in-calendar/
tags: [Sports]
firstSeen: 2026-07-05
lastChecked: 2026-07-05
---

Community ice rink at 10601 5th Ave NE, Northgate (Seattle Kraken
affiliated), with public skate, drop-in stick & puck, tot play hour,
and freestyle sessions.

Investigated 2026-07-05: the public/drop-in calendar is rendered via a
third-party rink-booking system called "DASH" — clicking an entry
requires logging into (or creating) a DASH account to register. The
page itself warns it "may take 10-15 seconds to load," consistent with
a JS-rendered widget with no static HTML or JSON payload we could find
in the page source. Even if fetchable, the content is recurring
drop-in session slots (public skate / stick & puck / tot play) whose
times shift week to week ("subject to change") rather than fixed-day
events, so it wouldn't cleanly fit either the ripper or
`sources/recurring` model without ongoing false-precision risk. Not
recommended without a confirmed structured feed.
