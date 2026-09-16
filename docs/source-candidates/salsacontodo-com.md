---
name: Monday Brazilian Zouk Social
status: investigating
platform: Wix Bookings (SYNC widget, JS-rendered)
url: https://www.salsacontodo.com/drop-ins
tags: ["dancing", "music", "nightlife"]
firstSeen: 2026-08-25
lastChecked: 2026-09-16
---

Discovered via aggregator gap analysis. 1 events in the Seattle
metro sample. Source domain: salsacontodo.com.

Sample event: "Monday Brazilian Zouk Social" (2026-08-25T05:00:00.000Z)
Description: Every Monday Brazilian Zouk social dancing. 10 PM - 12 AM. $10 cover.

Re-checked 2026-09-16: site is a Wix "Bookings" business (`Calendar SYNC`,
booking-flow strings in the plain-fetched HTML) — drop-in class times are
rendered by a client-side Wix Bookings widget, no static event data in the
initial HTML and no obvious JSON endpoint found. Would need headless-browser
rendering to scrape reliably. Left as `investigating` rather than `notviable`
in case a simpler feed turns up.
