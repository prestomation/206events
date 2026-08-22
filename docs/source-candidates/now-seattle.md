---
name: Now Seattle Events
status: added
pr: 1259
platform: Squarespace
url: https://www.nowseattle.org/events
tags: [Political, Community]
firstSeen: 2026-08-14
lastChecked: 2026-08-22
---

Now Seattle events calendar covering local happenings, food, arts, and culture.

**Findings (2026-08-14):** Note the description is off — this is the Seattle chapter of the
National Organization for Women (NOW), not a "local happenings/food/arts/culture" media
outlet; the `[Media]` tag looks mistaken and should probably be `[Political, Community]`
if implemented. Live, active Squarespace site (`images.squarespace-cdn.com`) with confirmed
upcoming events (Volunteer Orientations, "Seattle NOW Picnic" Aug 26 2026, Redistricting
task force-style meetings). Each event offers **Google Calendar and ICS download** links —
good candidate for a Squarespace-events-style ripper, though volume/relevance may skew
toward internal member meetings rather than public-facing events; worth checking before
implementing.

**Implemented 2026-08-22:** `?format=json` confirmed `collection.typeName:
"events-stacked"`, `itemCount: 91`, `upcoming` array with 2 future-dated
events (Seattle NOW Picnic Aug 26 2026, September Volunteer Orientation).
Added as `sources/now_seattle/ripper.yaml` using the built-in `squarespace`
ripper type — corrected description/tags per the note above (`[Political,
Community]`, not `[Media]`). `geo: null` since events rotate locations
(parks, Zoom); `sourceRole: venue` since Seattle NOW is the first-party
organizer of its own events, not an aggregator. `ONLY_SOURCE=now-seattle`
build confirmed 2 events, 0 errors.
