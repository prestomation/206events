---
name: "MixMix Socials"
status: added
platform: Instagram (type=instagram, LLM/vision cache-backed)
url: https://www.instagram.com/mixmixsocials/
tags: [Community]
firstSeen: 2026-07-11
lastChecked: 2026-07-11
---

Surfaced from a poster lookup for "Speed Dating for PPL Who Always Need a
Trip Booked" (Sugar Hill, Capitol Hill, Wed July 8 6pm — already past by the
time of investigation). MixMix Socials is a real, active, recurring Seattle
organizer — "Social events for Seattle's communities of color hosted at
BIPOC-owned spaces in the city" (bio) — running small-scale BIPOC-centered
speed dating and speed friending nights at a rotating set of BIPOC-owned
bars/cafes. 119 followers, `is_private: false`, 9 recent posts spanning
multiple distinct July events — not a one-off.

Presence: Instagram `@mixmixsocials` (confirmed live via the mobile web API,
`i.instagram.com/api/v1/users/web_profile_info`), bio link
`mixmix.start.page` (a link-in-bio page for event sign-up, not a
machine-readable calendar/API). No ICS feed, no Eventbrite/Humanitix
organizer page, no self-hosted events page found via WebSearch — ticketing
for individual events uses per-event Luma links posted per-flyer.

**Resolution: added via the `instagram` source type**, same pattern as
`freeze-tag-events`. The account posts each event as a dated flyer
(image or carousel) + caption; a "July Events" roundup carousel
(`DaJSQTBlhfB`) additionally listed all 5 July dates/venues in one place.
Implemented as `sources/mixmix-socials/ripper.yaml`
(`config.username: mixmixsocials`, `geo: null` — itinerant, multi-venue),
seeded into `instagram-cache.json` via the `instagram-source` skill:

- 3 events recorded from their own dedicated posts (Cool Dog Moms @ The
  Alley 7/15, Women's Sports Fans @ Pitch the Baby 7/23, and the original
  poster's PPL Who Love to Travel @ Sugar Hill 7/8 — already past, kept for
  lineage back to the poster that triggered this lookup).
- 2 events (New-ish to Seattle @ Miero Coffee Bar 7/27, Therapized Lolol @
  Navy Strength 7/30) had no dedicated post, only an entry on the roundup
  carousel — recorded under synthetic post ids
  (`DaJSQTBlhfB-newish-to-seattle`, `DaJSQTBlhfB-therapized`) since the
  carousel names both but doesn't include a start time; those two publish
  with an `UncertaintyError` for `startTime`, to be resolved by the
  event-uncertainty-resolver once a dedicated post appears.
- 1 duplicate announcement (`DaLeJfJEV-D`, an earlier flyer for the same
  Cool Dog Moms event as `DaoYEjtvox4`) and 4 purely promotional posts
  (explainer video, "3 reasons" carousel, flyering recap, general CTA)
  marked `isEvent: false`.

Refreshed on a schedule by re-running the `instagram-source` skill against
`@mixmixsocials`; past events pruned with `instagram-cache.py prune`.
