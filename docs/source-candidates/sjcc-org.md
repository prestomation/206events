---
name: Adult + Pediatric First Aid, CPR, AED + BBP Class
status: added
platform: Unknown
url: https://sjcc.org/event/adult-pediatric-first-aid-cpr-aed-bbp-class/2026-08-25/
tags: ["learning", "volunteering", "dancing", "fitness"]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
pr: 1574
---

Discovered via aggregator gap analysis. 8 events in the Seattle
metro sample. Source domain: sjcc.org.

Sample event: "Adult + Pediatric First Aid, CPR, AED + BBP Class" (2026-08-26T00:00:00.000Z)
Description: Learn how to respond confidently in emergency situations and potentially save a life. $50-$60.

2026-09-23: Stroum Jewish Community Center is at 3801 E Mercer Way, Mercer Island — outside Seattle. Duplicate of `stroum-jewish-community-center.md` (already notviable for the same reason); sample events are paid classes (CPR/first aid).

**Re-evaluated 2026-09-23 (King County rule): added.** Mercer Island is now in scope. The site is WordPress + The Events Calendar. The unfiltered feed is mostly member fitness classes and pool hours, so the new source reads the Tribe REST API (`/wp-json/tribe/events/v1/events?categories=adult-gatherings`). That category holds the public programs: author talks, concerts, comedy, film, exhibits, cooking demos. The site's `?ical=1` export works with curl, but the host (WordPress VIP) serves a "Checking your browser" page to Node fetch with a Chrome User-Agent, and the external-ICS fetcher sends that UA. So this is a small custom ripper instead of `sources/external/`. Source: `sources/stroum_jcc/` (name `stroum-jcc`, tags Community / Arts / Mercer Island). It produced 48 events (Sep 2026 to Jun 2027) with 0 errors. It supersedes the earlier `stroum-jewish-community-center.md` notviable verdict, which was based on geography and fitness classes.
