# Comprehensive Seattle Food Truck Support

**Status:** Design / implementation plan (not yet implemented)
**Goal:** Let a visitor subscribe to a calendar for *a particular food truck
location* ("Westlake food trucks") and, where the data allows, *a particular
truck*. Locations carry neighborhood tags; trucks carry a `FoodTruck` tag.

This document is the blueprint for the work; the two tracks below ship as
separate PRs.

---

## 1. The data landscape (what actually exists)

The premise that "the Seattle food truck website is dead" turned out to be
false, and the correction reshapes the whole feature.

### SeattleFoodTruck.com is alive and already integrated

`sources/seattle_food_trucks/ripper.ts` is a custom `IRipper` that consumes
the site's public JSON API and it works today:

| Endpoint | Returns |
|---|---|
| `GET /api/pods` | All food-truck **locations** ("pods") with `location.neighborhood` |
| `GET /api/locations/{id}` | Address / `filtered_address` / lat-lng for a pod |
| `GET /api/events?page=N` | Dated booking **slots** (paginated; ~1,391 over the window) |
| `GET /api/trucks?page=N` | All **trucks** (830), with cuisine, photo, socials, Yelp, website |
| `GET /api/trucks/{slug}` | One truck's profile + a *count* of `future_bookings` |

The existing ripper fetches pods → filters to a Seattle-neighborhood allow-list
→ pages events within a 30-day lookahead → **collapses every truck at a slot
into a single `Food Trucks @ {pod}` event** and emits **one** merged calendar
tagged `Food`. That merge is exactly the behavior we're now unwinding.

**Pod scale is small and manageable:** `/api/pods` returns **40 pods total**,
across 16 neighborhoods; after Seattle-area filtering it's roughly **~25
pods**. This is SPL-branch territory, not a manifest explosion.

### The truck↔slot assignment is NOT in the public API

This is the crux, and it's a bigger problem than "the site is dead." A
per-truck calendar needs to know *which truck is at which pod on which date*.
That join is not publicly exposed:

- `/api/events` slots are **pod-keyed only** — `display_name`/`title` is the
  pod name; there is no truck field.
- `/api/events?truck_id=369` — the truck filter is **ignored** (total count is
  unchanged at 1,391).
- `/api/trucks/{slug}` gives only a *count* of `future_bookings`, not the dates
  or pods.
- The pod detail that would carry the roster (`/api/pods/{id}`) returns
  `{"errors":["Authorized users only."]}`.

So SeattleFoodTruck.com gives us **everything for per-pod calendars** and
**nothing schedule-wise for per-truck calendars**. The 830-truck roster is
public (great for a catalog), but a truck's *itinerary* is not.

### Truck-centric aggregators are gated

StreetFoodFinder (`streetfoodfinder.com/c/wa/seattle`) and Roaming Hunger are
organized by truck and would be the natural per-truck source, but both `403`
from CI/residential IPs (bot protection) and neither is confirmed to expose a
per-truck schedule feed. They are unproven and would require the proxy ladder —
hence Track B is R&D, not a refactor.

---

## 2. Two tracks, shipped in parallel

### Track A — Per-pod calendars (feasible now, ships first)

Refactor `sources/seattle_food_trucks/` from a single-calendar aggregator into
a **multi-calendar ripper**, one calendar per Seattle pod (the `spl` 26-branch
source is the template).

**Behavior changes:**

1. **One `RipperCalendar` per pod.** Build the pod list from `/api/pods` (Seattle
   filter unchanged), then bucket booking slots by pod. Each pod → its own
   calendar `name`/`friendlyname`, its own `.ics`.
2. **Tags per pod:** `["FoodTruck", "<Neighborhood>"]`. The neighborhood comes
   from `location.neighborhood.name` mapped to our `city.config.ts` tag
   spelling (see §4). Pods with no neighborhood fall back to slug inference (as
   the ripper already does for suburbs) and get just `["FoodTruck"]`.
3. **Per-pod `geo`.** `/api/locations/{id}` and `/api/events/{event_id}` both
   carry `latitude`/`longitude` + address, so each pod calendar gets a real
   `geo` and appears in `venues.json` as a venue. (Ripper-level `geo: null`,
   per-calendar `geo` set — the `spl` pattern.)
4. **Event summary keeps the pod framing** (`Food Trucks @ {pod}`) since we
   still can't name the truck. `cost: { min: 0 }` unchanged (pods are free to
   attend).
5. **`expectEmpty: true`** on pods with intermittent/seasonal programming so a
   quiet week doesn't trip the zero-event gate.
6. **Stable IDs.** Keep deterministic ids derived from source content. Current
   `sft-${ev.id}` is stable (upstream booking id) — retain it; do **not** key on
   array index or timestamp.

**The merged view comes from the tag aggregator.** With every pod tagged
`FoodTruck`, the build auto-produces `tag-foodtruck.ics` (and `.rss`) combining
all pods — that *is* the citywide "all Seattle food trucks" feed, for free. So
the standalone single `seattle-food-trucks.ics` is retired:

- Removing that URL requires an `allowed-removals/seattle-food-trucks.ics` (and
  any renamed calendar) entry — CI's `check-missing-urls` fails otherwise.
  Delete the marker after the change deploys.
- Note for subscribers: the closest replacement is `tag-foodtruck.ics`.

**Tests:** update `sources/seattle_food_trucks/ripper.test.ts` against a saved
`sample-data.json` (pods + events + a location) — assert per-pod bucketing,
neighborhood tagging, geo population, and that a multi-truck slot no longer
collapses across pods. Scrub any embedded third-party keys from the fixture.

### Track B — Per-truck schedules (R&D spike, separate PR)

The deliverable of Track B is **a proven data path**, not calendars on day one.

1. **Build the truck catalog for free.** Page `/api/trucks` (830 trucks) into a
   reference doc — `docs/source-candidates/seattle-food-trucks-roster.md`
   (one doc, *not* 830 candidate files) capturing name, slug, cuisine,
   website, socials. This is the "chew through all at once" list you wanted,
   and it's the shortlist of trucks worth wiring up individually.
2. **Find where a truck's itinerary lives.** Investigate, in order:
   - StreetFoodFinder / Roaming Hunger per-truck pages — do they expose ICS or
     JSON? Both need the proxy ladder (`requires-proxy-testing`); stage, don't
     hand-pick a rung — let `skills/proxy-escalation` prove it.
   - Marquee trucks that self-publish a schedule (e.g. *Where Ya At Matt* has a
     public truck-schedule page). These can become individual sources under the
     normal `source-discovery` flow.
   - Instagram/Facebook-only trucks — high maintenance, likely out of scope.
3. **Do NOT create 800 ICS files.** Per-truck calendars are added *selectively*
   for trucks that (a) publish a machine-readable schedule and (b) are notable
   enough to justify a calendar. Each such truck is a normal source addition
   (`source-discovery` skill), tagged `["FoodTruck", ...]`.
4. If a truck-schedule source proves out broadly, a follow-up design covers a
   generalized per-truck ripper. Until then, per-truck is opportunistic.

---

## 3. Why per-truck can't just fan out the pod data

Even though we have all pod bookings, we cannot invert them into per-truck
schedules: the booking slots don't say who's booked. Fabricating a truck→slot
mapping would be a guess published as fact — exactly what the project's
uncertainty philosophy forbids. So per-truck stays gated on a real source.

---

## 4. Tags

- **New tag `FoodTruck`** (PascalCase, per the naming convention;
  single concept, no space). It does not exist yet; `Food` does. Optionally add
  `FoodTruck` to `TAG_CATEGORIES` under `Activities` in `lib/config/tags.ts` so
  the sidebar groups it; uncategorized still renders. Watch
  `detectTagDuplicates` — `FoodTruck` vs `Food` are distinct (no collapse), fine.
- **Neighborhood tags** are driven by `city.config.ts` `neighborhoods[]`, not
  `tags.ts`. The API's neighborhood names must be mapped to our spellings:

  | API neighborhood | Our tag | Note |
  |---|---|---|
  | `South Lake Union` | `South Lake Union` | exists |
  | `Downtown` | `Downtown` | verify present |
  | `Eastlake` | `Eastlake` | verify present |
  | `Belltown`, `Ballard`, `Fremont`, `Pioneer Square`, `SoDo`, `Georgetown`, `Northgate` | same | verify present |
  | `Breweries` | *not a neighborhood* | map to the real neighborhood per pod, or drop to just `FoodTruck` + `Beer` |
  | `University Of Washington` | `University District`? | map to nearest real neighborhood tag |

  Any genuinely new neighborhood is registered in `city.config.ts`, not
  `tags.ts`. Suburban pods (Bellevue/Bothell/Kirkland/Kent/Tukwila) are already
  excluded by the Seattle filter.

---

## 5. Cross-cutting concerns

- **Reporting parity.** Track A adds calendars but no new *error category*, so
  no new reporter plumbing is required. If Track B later adds a truck-specific
  gap queue, it must be plumbed through all five reporting surfaces in the same
  PR (per the Reporting Parity rule).
- **`venues.json` budget (100 KB).** ~25 pod venue entries is well within
  budget; re-check after the refactor. Truck catalog lives in a doc, not
  `venues.json`.
- **Photos.** Pods rarely have a photo; trucks do (`featured_photo` on
  `/api/trucks`). Track B truck sources can populate `imageUrl` from it. Pod
  `photoGaps` drain through the normal photo-resolver flow.
- **Cost.** Pods are free to attend (`cost: { min: 0 }`); individual truck
  prices are per-item and out of scope.
- **`sourceRole`.** Pod calendars are `venue` (a fixed place). A cross-pod
  roundup would be `aggregator`, but per-pod calendars are venues.
- **Proxy.** SeattleFoodTruck.com fetches fine from CI today (`proxy: false`);
  keep it. StreetFoodFinder/Roaming Hunger need the ladder (Track B).

---

## 6. Rollout

1. **PR 1 (Track A):** multi-calendar per-pod refactor of
   `sources/seattle_food_trucks/`, `FoodTruck` tag, neighborhood mapping,
   per-pod geo, `expectEmpty` where needed, `allowed-removals/` for the retired
   merged URL, updated tests + fixture. Auto-merge-eligible (calendar-source
   change).
2. **PR 2 (Track B):** the 830-truck roster doc + a written finding on whether
   StreetFoodFinder/Roaming Hunger/self-publishing trucks yield a usable
   schedule feed, plus 1–2 marquee per-truck sources if one proves out. The
   roster doc is content; a new per-truck ripper follows `source-discovery`.
3. This design doc merges first (requires manual review — it proposes a plan).

## 7. Open questions

- Do any StreetFoodFinder/Roaming Hunger per-truck pages expose ICS/JSON once
  past the 403? (Track B, first task.)
- For "Breweries" and "University Of Washington" API neighborhoods, confirm the
  exact target tag spelling against `city.config.ts`.
- Should the retired `seattle-food-trucks.ics` 301-equivalent be surfaced in
  release notes for existing subscribers, pointing at `tag-foodtruck.ics`?
