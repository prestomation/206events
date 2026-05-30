---
name: "Dacha Theatre"
status: investigating
platform: Humanitix JSON-LD
url: https://www.dachatheatre.com/
tags: [Theatre, "Capitol Hill"]
firstSeen: 2026-05-29
lastChecked: 2026-05-29
---

Discovered from a community poster board photo — "Dream, Carl, Dream!"
(June 5-27 2026 at 12th Avenue Arts).

Weebly brochure site with no ICS/API. Ticketing is on **Humanitix**, and
the per-production event page (e.g.
`https://events.humanitix.com/dream-carl-dream`) embeds a complete
JSON-LD `Event` array — 22 dated showings parsed cleanly. Verified
2026-05-29.

**Caveat:** the Humanitix URL is per-production, so a ripper must scrape
the Dacha homepage to discover the current show's Humanitix link and then
follow it (precedent: `sources/fremont_abbey` consumes Humanitix;
`sources/mopop`, `sources/nectar_lounge`, `sources/majestic_bay` parse
JSON-LD). Dacha is an itinerant company (geo: null; per-event location
from the JSON-LD). Deferred to a dedicated PR given the per-show URL
discovery step.
