---
name: Vermillion Gallery
status: added
platform: Custom HTML
url: https://www.vermillionseattle.com/
tags: [Art, Capitol Hill]
firstSeen: 2026-07-08
lastChecked: 2026-07-08
pr:
---

Art gallery and bar in the Pike/Pine part of Capitol Hill (1508 11th Ave).
The bar/music side of the venue is already covered (thinly, `expectEmpty`)
by `sources/seattle_showlists`. This candidate covers the **gallery**
exhibition schedule instead, which showlists does not carry.

No dedicated events page, ICS feed, or API — `/artchives` is a Squarespace
blog collection but it's retrospective (posted after each show closes, so
it lags ~1-2 months behind the current exhibition and can't be used for
upcoming dates). `/events`, `/calendar`, `/exhibitions`, `/shows` all 404.

The current exhibition's title and two reception dates (opening + Capitol
Hill Art Walk) are hand-written into a homepage rich-text block each month,
e.g.:

> Jeff Mihalyo: PAST & PRESENT
> Opening Thursday, July 2, 2026 5-8pm
> Capitol Hill Artwalk Reception: Thursday, July 9, 2026 5-9pm
> Show runs through August 3, 2026

Implemented as a custom HTML scraper (`sources/vermillion_gallery/`) that
parses that block directly. Produces 2 events/month (opening reception +
art walk reception) from the live page as of 2026-07-08. Reuses the same
geo/OSM data already verified for the `vermillion` calendar in
`seattle_showlists`.
