---
name: "Dacha Theatre"
status: added
platform: Humanitix JSON-LD
url: https://www.dachatheatre.com/
tags: [Theatre, "Capitol Hill"]
firstSeen: 2026-05-29
lastChecked: 2026-05-30
pr: pending
---

Discovered from a community poster board photo — "Dream, Carl, Dream!"
(June 5-27 2026 at 12th Avenue Arts).

Weebly brochure site with no ICS/API. Ticketing is on **Humanitix**, and
the per-production event page (e.g.
`https://events.humanitix.com/dream-carl-dream`) embeds a complete
JSON-LD `Event` array — 22 dated showings parsed cleanly. Verified
2026-05-29.

**Implementation:** `sources/dacha_theatre/ripper.ts` fetches the Dacha
homepage, extracts Humanitix event URLs via regex, then fetches each
Humanitix page and parses the JSON-LD Event array. `expectEmpty: true`
since the source goes dark between productions. `geo: null` since Dacha
is itinerant (per-event location comes from JSON-LD).
