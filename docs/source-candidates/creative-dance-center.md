---
name: "Creative Dance Center"
status: notviable
platform: Custom HTML (WordPress)
url: https://www.creativedance.org/classes-workshops/
tags: [Dance, Kids]
firstSeen: 2026-08-25
lastChecked: 2026-09-23
---

Dance education nonprofit (Wallingford, 4649 Sunnyside Ave N) mixing
ongoing class registration with dated public workshops/institutes.
As of this Aug 25, 2026 investigation, the listed examples (a "Movement
Matters" parent/educator workshop in March, "BrainDance for Every Body"
in May, Summer Dance Institute for Teachers in July, Summer Teen
Intensive and Summer Dance Lab in August, plus themed weekly summer
camps) had all already passed for the year — the page hadn't yet posted
its next round. The one confirmed still-future dated item at check time
was "An Afternoon of Dance" (school performance, Mar 21, 2027). The
recurring cadence (several single-day public workshops per year, named
per-instructor/topic, alongside multi-week Fall/Winter and
Winter/Spring class sessions) suggests the page refreshes with new
dated workshops seasonally — re-check closer to a session start for
current examples before implementing.

WordPress-hosted, class registration via a third-party system
(`reg135.imerisoft.com`) — no Squarespace/Eventbrite/ICS export
detected for the workshop listings themselves. 🔴 Low confidence tier
(custom HTML scraper required to pull the dated workshops out from the
surrounding class-registration content), low volume (~6 dated
public events/year) but valid per the low-volume-sources directive.

Re-checked 2026-09-23: `/classes-workshops/` now lists only the Fall/Winter class session (Sep 8, 2026 to Jan 23, 2027) and Winter/Spring session info. The dated public workshops are all past (Jan/Mar/May 2026) and no new ones are posted. The only future dated public item is the school show "An Afternoon of Dance" (Mar 21, 2027) at Shorecrest PAC in Shoreline, outside Seattle. There is no ICS/Tribe/REST feed (`/wp-json/tribe/events/v1/events` returns 404, `?ical=1` returns HTML). The page is mostly class registration, so a scraper would extract almost nothing. Closing as notviable.
