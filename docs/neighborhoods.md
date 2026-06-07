# Neighborhoods — how the homepage groups venues by area

The Discover → **Calendars** view groups channels into area sections (the
uppercase headings). This doc explains the data model behind those headings,
because it is not what people usually assume: **there is no geospatial
neighborhood model.** A "neighborhood" is purely a registered **tag string**.

## The model

1. **The registry is the source of truth.** `TAG_CATEGORIES.Neighborhoods`
   in `lib/config/tags.ts` is a hand-maintained flat list of strings that
   count as neighborhoods (`Ballard`, `Capitol Hill`, `Uptown`, …). It also
   holds nearby suburbs treated as areas (`Shoreline`, `Vashon`, `Renton`,
   `Tukwila`, …).

2. **A venue "is in" a neighborhood iff one of its `tags:` is in that list.**
   `categoryFor(tag)` (`lib/config/tags.ts`) returns the tag's category, and
   `isNeighborhoodTag(tag)` (`web/src/redesign/categories.js`) is just
   `categoryFor(tag) === 'Neighborhoods'`. The web view-model
   `hoodFromTags(tags)` (`web/src/redesign/viewModels.js`) returns the first
   tag that passes that test; that string becomes the section heading.

3. **There is no fallback to the venue address.** A channel's `hood` comes
   **only** from a registered neighborhood tag. We deliberately do *not* fall
   back to the venue's `geo.label`, which is a raw street address
   (`"2100 6th Ave, Seattle"`) and reads poorly as an area heading. An
   untagged venue yields `hood = null` and groups under
   **"Citywide · multiple venues"** instead.

   > Historically the code fell back to `geo.label`, which is why raw
   > addresses appeared as if they were neighborhoods. That fallback was
   > removed; see `channelFromCalendar` in `viewModels.js` and its tests.

## Consequence: neighborhood tags are the one exception to "any tag is valid"

Tags are normally free-form — any string in a source's `tags:` is valid and
shows under "Other" in the UI. **Neighborhoods are the exception.** For a tag
to be *recognized as a neighborhood* (and thus produce an area heading), it
**must be registered** in `TAG_CATEGORIES.Neighborhoods`. Tag a venue
`"Belltown"` while `"Belltown"` is absent from the registry and
`isNeighborhoodTag` returns `false`, so it won't head an area section.

This registration requirement is **enforced for venues** (sources with a
non-null `geo`): `scripts/check-discovery-api.ts` fails CI if any entry in
`venues.json` lacks a registered `Neighborhoods` tag (the remediation is to
tag it, register the neighborhood, or set `geo: null`). Non-venue sources
(`geo: null` — community calendars, multi-venue series) are **not** gated:
they may carry any tag strings freely, and an unregistered "neighborhood"
string on them simply isn't recognized as a neighborhood (no area heading,
no error). The enforcement lives where it matters — the places that head
area sections.

## Adding a neighborhood to a source (two steps)

1. **Register the neighborhood** in `lib/config/tags.ts` →
   `TAG_CATEGORIES.Neighborhoods` if it isn't already there. Follow the
   tag-naming conventions in `AGENTS.md` (natural casing with spaces for
   neighborhoods: `"Capitol Hill"`, `"West Seattle"`). The slug
   `tag.toLowerCase().replace(/[^a-z0-9]/g, '-')` becomes the
   `tag-<slug>.ics` aggregate URL, so multi-word names are fine
   (`"Stadium District"` → `tag-stadium-district.ics`).
2. **Tag the source** — add the exact string to the calendar's `tags:` array
   in its `ripper.yaml` / `sources/external/*.yaml` / `sources/recurring/*.yaml`.
   Ripper-level and calendar-level tags are **unioned** at build time, so a
   ripper-level neighborhood tag applies to every calendar in that ripper.

Because nothing connects coordinates to neighborhoods, assigning the right
neighborhood is a human judgment: read the venue's address/coords, decide the
neighborhood, tag it. (A future enhancement could derive neighborhoods from
coordinates via boundary polygons, eliminating the manual step.)

## Non-venue sources

A source that has no single fixed location (a community calendar, a
multi-venue series, MEHVA's roving bus rides) should declare `geo: null` and
carry no neighborhood tag. It then groups under "Citywide · multiple venues"
— which is correct, not a gap.
