---
name: "Movies at the Mural (Seattle Center)"
status: added
platform: Custom HTML
url: https://www.seattlecenter.com/events/featured-events/movies-at-the-mural
tags: [Movies, QueenAnne]
firstSeen: 2026-05-24
lastChecked: 2026-05-24
issue: 398
---
Free Friday-night outdoor film series on the Mural Amphitheatre lawn at
Seattle Center, late July through August. 2026 season: Wonka (Jul 24),
The Princess Bride (Jul 31), Hamilton (Aug 7), Coco (Aug 14), Masters of
the Universe (Aug 21). Movies begin at dusk (about 9 PM). Each feature
is preceded by a student short film from Cornish / UW PCE.

The schedule is published on the featured-events page rather than the
main Seattle Center event calendar — the existing `seattle_center`
ripper crawls the event-calendar endpoint and does not surface these
screenings. A dedicated ripper for `/events/featured-events/movies-at-the-mural`
fills that gap.

The page renders each movie night as an `<a class="featured-item">`
card whose `<h3 class="featured-item__title">` contains the title and
date in `"Title | Mon DD"` format, with the gallery image as a CSS
`background-image: url(...)` on the anchor. Year is inferred (page never
states it explicitly); the soonest-future occurrence logic handles
roll-forward.

Second of three candidates filed under #398 to land. Remaining
candidates (West Seattle Junction "Movies on the Wall", SLU Discovery
Center "Outdoor Cinema") are tracked separately and were unreachable
from this environment.
