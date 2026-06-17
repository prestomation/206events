# Cross-source event de-duplication

## Problem

The same real-world event is frequently listed by **multiple sources**, so it
appears two or three times in the calendar. Example (Sunday Sep 13, "Live Aloha
Hawaiian Cultural Festival" at Seattle Center):

| Source feed | Title | Location | Time |
|---|---|---|---|
| `seattle-center-festal` | Live Aloha Hawaiian Cultural Festival | Seattle Center, 305 Harrison St | 11 AM–7 PM |
| `visit-seattle` | **Festal:** Live Aloha Hawaiian Cultural Festival | Seattle Center | all-day |
| `external-nw-asian-weekly` | Live Aloha Hawaiian Cultural Festival | Armory Food & Event Hall, 305 Harrison St | all-day |

This is distinct from the **same-source recurrence** linking shipped earlier
("Other dates", `web/src/lib/event-grouping.js`), which keys on `icsUrl` and
deliberately never crosses feeds. Here we need to recognize that events from
*different* feeds are the same occurrence.

The existing same-day dedup (`web/src/lib/event-dedup.js`, mirrored in the
favorites worker) is too weak for this: it requires geo ≤ 50 m and **skips
coordless events entirely**, so a campus venue (Seattle Center, ~90–170 m
across) or a coordless listing (the Festál row) never matches.

## Why build-time (and why the ICS feeds are untouched)

The matcher runs at **build time** and operates **only on `events-index.json`**
(the website/search artifact). It *marks* events — it never drops `.ics` URLs
or rewrites any feed. The per-source `.ics`, the `tag-*.ics` aggregates, and the
favorites-worker personal feed are all unchanged.

Build-time, rather than in-browser, buys three things:

1. **It is the only home for the resolver tier.** Medium-confidence matches are
   confirmed/rejected by an LLM resolver *across builds* via a committed cache —
   an offline loop the browser can't join. The build emits candidates; the
   resolver writes the cache; the next build reads it.
2. **The complex logic is written once.** The simple dedup is currently
   duplicated (`web/src/lib/event-dedup.js` is a hand-kept port of the worker's
   `event-dedup.ts`, held byte-identical by the parity rule). Confidence tiers +
   the contradiction veto + OSM logic is too much to maintain in two languages.
   Computing once and stamping the grouping into `events-index.json` means the
   web UI just *reads* it and **the worker needs no change**.
3. **It can use richer signals and feeds reporting.** Build-time can match
   coordless events on location text + OSM (the browser dedup can't), and it is
   where the merge/candidate counts for `build-errors.json` and the five
   reporting surfaces originate.

## Signals

Computed only for cross-`icsUrl` pairs **within the same calendar day**:

- **Title** — token (Jaccard) similarity over lowercased alphanumeric tokens.
  Intentionally rough — no custom prefix/suffix stripping, which produces too
  many false splits/merges on short titles.
- **Location** — the strongest available of:
  - same OSM feature (`osmType`+`osmId` equal), or
  - haversine distance, or
  - location-string token overlap (covers coordless events).
- **Time** — whether the `[start, end]` ranges overlap.

### The location-contradiction veto (learned from prod data)

Coordinates can be **wrong**, and when they are, title+coords alone produce
confident false merges. Real example from prod:

```
Stoup Ballard  "Trivia ... with Head in the Clouds"  @ 1108 NW 52nd St (Ballard)
Stoup Cap Hill "Trivia ... with Head in the Clouds"  @ 1158 Broadway (Capitol Hill)  ← 5 mi away
→ osm=True, dm=0m   (geocoding bug: both addresses cached to identical coords/osmId)
```

Title agrees, coords agree, times overlap — but the **location strings flatly
disagree** (different street number, different neighborhood). So the location
text is an independent signal: when two strings carry contradictory street
numbers or known-neighborhood tokens, the pair is vetoed out of the HIGH tier
(downgraded to a candidate) even if coords match.

## Confidence tiers

| Tier | Gate (starting point — tune against the probe) | Action |
|---|---|---|
| **HIGH** | title ≥ 0.6 · time-overlap · (OSM-same **or** ≤ 75 m) · **not** location-contradicted | Auto-merge: collapse + attribute |
| **MED** | title ≥ 0.5 · overlap-or-touching · (OSM-same **or** ≤ 500 m **or** loc-text ≥ 0.5), incl. coordless | Duplicate-candidate queue → resolver |
| **LOW** | below the above | Ignore |

Campus-scale matches (Seattle Center, 90–170 m) intentionally land in **MED**,
not HIGH — that 75–200 m band is exactly where genuinely *adjacent but
distinct* venues live, so they get reviewed rather than silently merged.

### Auto-merge behavior — collapse + attribute

A HIGH match marks one **canonical** event and the others as suppressed, all
sharing a `duplicateGroupId`, with the canonical event carrying `dedupedSources`
(reusing the existing attribution-chip mechanism). The web UI renders one card
with "also listed in X, Y". **Events are marked, never deleted** — a wrong match
groups visually but never destroys data, and the per-source ICS is untouched.

### Canonical selection — venue beats aggregator

Which member of a HIGH group becomes canonical matters: that copy owns the card,
its title/description/link are what the user sees, and the others are attributed
to it. When the same real-world event is listed by both the **venue itself** and
an **aggregator** (a show-listing site, community calendar, or scene round-up
that republishes other orgs' events), the venue's own listing is the better
canonical — it's first-party, usually better-titled, and links to the source of
truth.

Every source therefore declares a required `sourceRole` of `venue` or
`aggregator` (`sourceRoleSchema` in `lib/config/schema.ts`), mirroring how `geo`
is a required explicit decision on every source. It is **not** derivable from
`geo`: an aggregator can carry per-calendar `geo` (e.g. `seattle_showlists`), and
a multi-branch first-party source is ripper-level `geo: null` but still a venue
(e.g. `spl`). The build maps each feed's icsUrl to its role and passes
`roleByIcsUrl` into `findDuplicates`; `canonicalOf` then ranks **venue (0) before
aggregator (1)**, breaking ties on the lexicographically-smallest fullKey as
before. A missing role is treated as a venue (the safe default — venues are the
common case and should never be demoted behind an aggregator over a missing
field). The role only influences the canonical pick; it never changes which
events match or their tier.

The aggregator set is curated (the minority): `events12`, `seatoday`,
`seattle-showlists`, `19hz`, `NWMetalCalendar`, neighborhood/city-wide calendars
(`visit-seattle`, `downtown-seattle-association`, `seattle-center`, …), and the
`free-first-thursday` recurring catch-all (so per-museum FFT synthesis wins).
Everything else is a `venue`.

## Prod-data calibration (2026-06-17 snapshot, 11,208 events)

A throwaway probe over the live `events-index.json` (kept as the unit-test
fixture):

- **2,402** cross-source candidate pairs (title Jaccard ≥ 0.4, same day).
- **HIGH** (title ≥ 0.6 · OSM-or-≤75 m · overlap) → **928 pairs**, collapsing
  **728 cards (~6.5%)**. Cluster sizes: 429×2, 107×3, 27×4, 1×5.
- **MED** (looser; 212 coordless text-only) → **287 pairs**.
- HIGH is dominated by one publisher's overlapping themed sub-feeds — the safest
  possible merges: `seatoday-*` (all/arts/community/sports/learning),
  `seattle-gov-*` (arts/city-wide/neighborhoods), `external-uw-*` — plus
  venue-direct vs `seattle-showlists-*` (Royal Room, Nectar).
- The Stoup false positive above is in the raw HIGH set **before** the veto;
  it's the motivating test case for the contradiction guard.

## Reporting parity

The duplicate-candidate queue and merge counts are a new error/stat category, so
they are plumbed through every reporting surface in the same PR (per the
Reporting Parity rule): `build-errors.json`, the PR comment, the
`$GITHUB_STEP_SUMMARY`, the Discord notification, the website health dashboard,
and the build-report skill.

## Parity note (favorites / following)

Suppression of `duplicateOf` entries is applied in the **display-only** redesign
path — App206's `upcomingEvents` (list/search) and the events map (the
`isMappable` predicate in `web/src/components/EventsMap.jsx` plus the map panel's
`shownCount` in `shell.jsx`) — not in the shared `upcomingIndexEvents` helper.
The map reads the raw `eventsIndex` directly (it needs every coord-bearing
event), so it has to drop `duplicateOf` itself; without that a HIGH-merged event
drops two or three overlapping pins. The favorites/following path and the
favorites-worker ICS feed have no knowledge of build-time `duplicateOf`, so
applying suppression to the shared helper would make the Following preview
over-collapse relative to the feed the user actually receives — the exact
client/server drift the "Favorites Filter Parity" rule guards against. Keeping
suppression display-only preserves that contract.

## Known limitations / follow-ups

- **Deep-links to a now-suppressed duplicate** resolve against the (suppressed)
  display list and fall back to the section view instead of redirecting to the
  canonical. Graceful (no crash; suppressed copies are redundant), but a future
  improvement is to look the token up in the full index and, when it carries
  `duplicateOf`, open the canonical.

## Out of scope / unchanged

- Favorites-worker personal ICS feed and its UID-based merge — unchanged.
- Per-source and `tag-*` ICS files — unchanged.
- Same-source recurrence ("Other dates") — already shipped, orthogonal.
