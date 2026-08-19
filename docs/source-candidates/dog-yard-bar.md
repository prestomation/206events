---
name: Dog Yard Bar Events
status: candidate
platform: Squarespace
url: https://www.dogyardbar.com/events
tags: [Pets, Nightlife]
firstSeen: 2026-08-14
lastChecked: 2026-08-19
---

Seattle dog bar where patrons can bring their dogs, hosting themed events and social gatherings.

Verified 2026-08-14: live events page for Dog Yard Bar, 1540 NW Leary Way,
Seattle (Ballard). Confirmed **Squarespace** (squarespace-cdn.com asset
URLs) — should support `?format=json` per the built-in Squarespace ripper
type. Dated events confirmed: recurring breed meetups (Small Dog Meetup
weekly Sundays, Chihuahua Meetup, Pointer & Vizsla Meetup, Dog Content
Creator Meetup) through Aug/Sept 2026. Walk-in/no-ticketing format. Not a
religious org; not found under `sources/`.

**Re-checked 2026-08-19:** the `/events` page (nav target) is not itself
a Squarespace Events collection — it's a plain page (`type: 10`,
`itemCount: 0`) whose visible copy is a stale cached summary block. The
real events collection is at `/events-all` (`type: 1`,
`events-stacked`, `itemCount: 123`), confirmed via `?format=json`, but
its `upcoming` array is **empty** and the most recent `past` entry dates
to mid-December 2024 — the collection has not been updated in ~20
months despite the venue's site otherwise being live. Per the
quality-gate rule ("200 + 0 events → do not implement"), holding this as
`candidate` rather than implementing against a dead pipeline. Worth a
fresh check next cycle in case the venue resumes posting to
`/events-all`.
