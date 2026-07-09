---
name: Seattle AttendTickets (Free Shows)
status: notviable
platform: AttendTickets
url: https://seattle.attendtickets.com/free
tags: [Music, Community]
firstSeen: 2026-07-08
lastChecked: 2026-07-09
---

Discovered via r/SeattleEvents post: https://old.reddit.com/r/SeattleEvents/comments/1uls31r/posted_every_week_free_and_paywhatyouchoose_shows/
Post title: "Posted every week: free (and pay-what-you-choose) shows around Seattle"
Post date: 2026-07-02

A weekly-posted list of free and pay-what-you-choose shows around Seattle.
The user u/forrestblount posts this regularly. The attendtickets.com site
appears to be a ticketing platform — the /free page aggregates free events.
Could be a good source if the site has structured data (JSON/API) or if the
list can be scraped. Needs investigation of the attendtickets.com platform.

Re-investigated 2026-07-09:
- Server-rendered HTML with a stable `.show-card` block per event (title,
  venue, ISO `<time datetime>`), so it's technically scrapable
- But the page is a rolling "week of <date>" snapshot (9 events at time of
  check) with no visible pagination or JSON API for future weeks — would
  need a weekly re-scrape with no guarantee of a stable URL/shape
- Heavy overlap with sources already implemented directly: this week's
  cards included GreenStage (`sources/external/greenstage.yaml`) and
  Seattle Center Festál (`sources/seattle_center_festal/`), both already
  covered as first-party sources; the aggregator would mostly duplicate
  events we already get from the primary org
- Not viable: no stable feed, and what's scrapable is largely redundant
  with existing coverage