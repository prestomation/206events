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
| `GET /api/locations/{id}` | Address / `filtered_address` / slug for a pod (**no** lat/lng) |
| `GET /api/events/{event_id}` | Booking detail incl. `location.latitude`/`longitude` + `google_place_id` (verified live) |
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

One more path was checked and closed: the user-facing pod **schedule page**
(`/schedule/<pod-slug>`, HTML) embeds a `featured_trucks` roster — the trucks
that *frequent* a pod (e.g. Westlake lists Big Dog's, Birrieria Pepe El Toro,
Cathouse Pizza) — but that's a static affiliation, **not** a dated
truck→date→pod booking. There is no public surface anywhere that says "truck X
is at pod Y on date Z." (That page also inlines live third-party keys — Stripe
`pk_live_…`, Google Maps, Facebook — so if any SFT HTML is ever saved as a
fixture it must be scrubbed per the repo's credential rule.)

### But individual trucks often publish their own schedule

The per-truck gap is filled from the *trucks*, not SFT: many self-publish a
subscribable calendar. **Tat's Truck** (verified) embeds a public Google Calendar
on `tatsdeli.com/tats-truck` with 623 dated, located events — a drop-in external
ICS. Notably, Tat's schedule is **absent** from SFT's pod-events feed, which is
the concrete proof that SFT can't be the sole truck source. So per-truck is
feasible today for trucks with their own feed (Track B1); the aggregator route
below is only for trucks without one.

### Truck-centric aggregators are gated

StreetFoodFinder (`streetfoodfinder.com/c/wa/seattle`) and Roaming Hunger are
organized by truck and would be a fallback per-truck source for trucks that
don't self-publish, but both `403` from CI/residential IPs (bot protection) and
neither is confirmed to expose a per-truck schedule feed. They are unproven and
would require the proxy ladder — hence Track B2 is R&D, not a refactor.

---

## 2. Two tracks, shipped in parallel

### Track A — Per-pod calendars (feasible now, ships first)

Refactor `sources/seattle_food_trucks/` from a single-calendar aggregator into
a **multi-calendar ripper**, one calendar per Seattle pod (the multi-branch
`spl` source, ~25 calendars, is the structural template for emitting many
calendars from one ripper).

**SFT's role — the location layer for public pods (decided).** Because SFT can't
name the truck at a slot (see §3), its per-pod calendar answers one specific,
still-valuable question: *"there will be food trucks at this location at these
times."* That's most useful for **managed public/corporate pods with no other
feed** — Westlake Center, McGraw Square, South Lake Union, Starbucks Center,
Expedia, T-Mobile campus, etc. Truck-*following* comes from the self-published
truck feeds in Track B1; the two layers are complementary. Consequently SFT is
scoped to those public pods and **skips pods already covered by dedicated
rippers** (breweries like Cairn, and the "Breweries" bucket), which frequently
name the truck themselves — a worse duplicate helps no one.

**Behavior changes:**

1. **One `RipperCalendar` per public pod.** Build the pod list from `/api/pods`
   (Seattle filter unchanged), then bucket booking slots by pod. Each pod → its
   own calendar `name`/`friendlyname`, its own `.ics`. Pods marked
   `skip: true` in `POD_CONFIG` (those covered by a dedicated ripper) produce no
   calendar — the exact `skip` pattern `seattle_showlists` uses for venues with
   their own rippers.
2. **Tags per pod:** `["FoodTruck", "<Neighborhood>"]`. The neighborhood comes
   from `location.neighborhood.name` mapped to our `city.config.ts` tag
   spelling (see §4). Pods with no neighborhood fall back to slug inference (as
   the ripper already does for suburbs) and get just `["FoodTruck"]`.
3. **Per-pod `geo`.** `/api/events/{event_id}` carries `location.latitude`/
   `longitude` + `google_place_id` (verified live); `/api/locations/{id}` gives
   only the address string. So the implementer has two paths: read lat/lng from
   the per-event detail (the ripper doesn't fetch it today — its
   `LocationDetails` interface and the committed fixture have no lat/lng, so
   this is new work), or geocode the pod address through the existing geo-cache.
   Either way each pod calendar gets a real `geo` and appears in `venues.json`.
   Set ripper-level `geo: null` with a per-calendar `geo` per branch. **Caveat:**
   per-calendar `geo` is schema-supported (`lib/config/schema.ts`, which names
   SPL as the archetype) but `sources/spl` does not actually populate it today,
   so there is no working in-repo example to copy — this is the first source to
   exercise per-calendar `geo`.
4. **Event summary keeps the pod framing** (`Food Trucks @ {pod}`) since we
   still can't name the truck. `cost: { min: 0 }` unchanged (pods are free to
   attend).
5. **`expectEmpty: true`** on pods with intermittent/seasonal programming so a
   quiet week doesn't trip the zero-event gate.
6. **Stable IDs.** Keep deterministic ids derived from source content. Current
   `sft-${ev.id}` is stable (upstream booking id) — retain it; do **not** key on
   array index or timestamp.

**The merged view comes from the tag aggregator — and the merged calendar is
kept as an anchor.** With every *pod* calendar tagged `FoodTruck`, the build
auto-produces `tag-foodtruck.ics` (and `.rss`) combining all pods — that *is*
the curated citywide "all Seattle food trucks" feed. The original single
`seattle-food-trucks-seattle-food-trucks.ics` calendar is **not** retired,
though; it's kept for two reasons discovered during implementation:

- **The new-source 0-event gate is fatal and `expectEmpty` does not exempt it.**
  Renaming/removing the one existing calendar makes the whole `seattle-food-trucks`
  source register as "new" (none of its calendars match the deployed manifest),
  and then *any* declared pod calendar that happens to be empty in the CI build
  fails the build. Pods are empty most weeks. Keeping the original calendar name
  means at least one calendar is always known-deployed, so the source is never
  "new" and empty pods are non-fatal.
- It preserves existing subscribers and needs **no `allowed-removals/` entry**.

To avoid double-counting in tag feeds, the merged calendar is tagged only
`Food` (its events land in `tag-food.ics`) while the per-pod calendars are
tagged `FoodTruck` + neighborhood (their events land in `tag-foodtruck.ics` and
the neighborhood aggregates). No single tag feed contains both, so nothing
duplicates. Ripper-level `tags` is left unset so tags don't union into every
calendar.

**Tests:** update `sources/seattle_food_trucks/ripper.test.ts` against a saved
`sample-data.json` (pods + events + a location) — assert per-pod bucketing,
neighborhood tagging, geo population, and that a multi-truck slot no longer
collapses across pods. Scrub any embedded third-party keys from the fixture.

#### Keeping the pod list current — deterministic new-pod detection

New pods get added to SeattleFoodTruck.com over time; we want to pick them up
without a human periodically eyeballing the site. There are two ways to do it,
and we should do the **first** (the second is a weaker fallback).

**Chosen: the ripper self-detects unconfigured pods and emits a gap error.**
This is exactly the pattern `sources/seattle_showlists/ripper.ts` already uses
for venues (`detectUnknownVenues()`, which emits
`Unknown venue "X" not in VENUE_CONFIG — add it so events are routed to a
calendar` as a non-fatal `ParseError`). We mirror it:

- The ripper *already* fetches the full pod list (`GET /api/pods` — this **is**
  the "list pods API"), so the check is nearly free.
- Pods are curated in a `POD_CONFIG` map (or the `ripper.yaml` calendars list):
  which pods get a calendar, their neighborhood tag, `geo`, `expectEmpty`, and a
  `skip` flag for pods covered by a dedicated ripper. Curation is needed anyway
  because the API's neighborhood names don't map cleanly to our tags
  (`Breweries`, `University Of Washington` — see §4) and because we only surface
  public pods, not brewery-duplicate ones.
- For every Seattle-area pod returned by `/api/pods` that is **not** in
  `POD_CONFIG`, emit a `ParseError`:
  `Unknown pod "<name>" (neighborhood "<nb>", slug "<slug>") not configured — add a calendar entry`.
  It lands in `output/build-errors.json` under the source's `sources[].errors`
  (the same channel every reporting surface already reads — no new category, so
  no Reporting-Parity plumbing needed) and is **non-fatal** (an unconfigured pod
  doesn't fail the build; it just surfaces).
- The **build-report skill** drains it (decided — volume is low, no dedicated
  pod-resolver skill needed): the LLM reads the error, decides the neighborhood
  tag, and opens a PR adding the `POD_CONFIG` entry. Deterministic detection,
  human-reviewed addition, stable URLs (a new calendar URL only appears once
  curated, never spontaneously).

This is strictly better than scanning HTML: the signal is the authoritative API
diff, and it rides the existing error-reporting pipeline.

**Fallback (optional, not required if the above ships): a discovery-skill
sweep.** `skills/source-discovery` could, on its rotating cadence, diff
`/api/pods` against `POD_CONFIG` and file candidates. This only runs when
discovery runs, does the same diff less deterministically, and duplicates the
ripper's own knowledge — so it's redundant once the ripper self-detects. Keep it
in the back pocket only if we decide *not* to curate pods in config.

### Track B — Per-truck schedules (feasible via self-published feeds + R&D tail)

Per-truck is **not** fully blocked — it splits into a feasible near-term path and
a research tail. The key correction from the first draft: **SeattleFoodTruck.com
is incomplete and cannot be the sole truck source.** Tat's Truck is the proof —
it has an SFT *directory* page, but its actual schedule is **not** in the
pod-keyed `/api/events` feed our ripper consumes; Tat's publishes its own Google
Calendar instead. Relying on SFT alone silently misses trucks like it.

**B1 — Import self-published truck feeds as external ICS (do this now).**
Many trucks publish their own schedule as a subscribable calendar. These are the
highest-quality per-truck data and drop straight into our external-ICS pipeline
with zero custom code.

- **Worked example — Tat's Truck (verified live):** the page
  `tatsdeli.com/tats-truck` embeds a public Google Calendar,
  id `2v113sqaad63bp65qs6j98gc4k@group.calendar.google.com`. Its public ICS —
  `https://calendar.google.com/calendar/ical/2v113sqaad63bp65qs6j98gc4k%40group.calendar.google.com/public/basic.ics`
  — returns HTTP 200 with `X-WR-CALNAME: Tat's Truck Schedule` and 623 VEVENTs
  (real summaries + street addresses). It becomes
  `sources/external/tats-truck.yaml`, `sourceRole: venue` (the truck is
  first-party for itself), `geo: null` (it roams), tags `["FoodTruck", ...]`.
  Notes for implementation: the feed carries historical events (back to 2017)
  and some non-Seattle stops (e.g. Bellevue) — the external-ICS lookahead filter
  handles the past. **Decision: do not geo-filter a truck's own feed** — you
  subscribe to the truck and follow it wherever it goes, so its out-of-Seattle
  stops stay in.
- **Finding these feeds** is a `source-discovery` sub-task: for notable trucks,
  check their own site/Linktree/Squarespace for a Google Calendar embed or
  "subscribe" link (grep the page for `calendar.google.com`, `webcal://`,
  `.ics`). Each confirmed feed is one `sources/external/<truck>.yaml`. Marquee
  trucks that publish an HTML-only schedule (e.g. *Where Ya At Matt*) can get a
  small custom ripper instead.

**B2 — Trucks without their own feed (research tail).**
- **Build the truck catalog for free.** Page `/api/trucks` (830 trucks) into one
  reference doc — `docs/seattle-food-trucks-roster.md` (one
  doc, *not* 830 candidate files) capturing name, slug, cuisine, website,
  socials. This is the "chew through all at once" list, and it's where we look
  up a truck's website to hunt for a B1 feed.
- **Aggregator investigation.** StreetFoodFinder / Roaming Hunger are
  truck-centric but 403 CI/residential IPs and are unproven — do they expose a
  per-truck ICS/JSON once past the block? Stage as `requires-proxy-testing`;
  don't hand-pick a rung — let `skills/proxy-escalation` prove it.
- **Do NOT create 800 ICS files or synthesize schedules.** Per-truck calendars
  are added *selectively* for trucks with a real, machine-readable schedule.
  Instagram/Facebook-only trucks are high-maintenance and out of scope for now.

---

## 3. Why per-truck can't just fan out the SFT pod data

Even though we have all SFT pod bookings, we cannot invert them into per-truck
schedules: the booking slots don't say who's booked. Fabricating a truck→slot
mapping would be a guess published as fact — exactly what the project's
uncertainty philosophy forbids. So per-truck schedules must come from a source
that actually names the truck's stops — which is precisely what the
self-published feeds in **Track B1** (e.g. Tat's Google Calendar) provide.

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
  keep it. Google Calendar ICS feeds (Track B1, e.g. Tat's) fetch fine too.
  StreetFoodFinder/Roaming Hunger need the ladder (Track B2).

---

## 6. What shipped (this PR)

All three tracks are implemented together in this PR:

1. **Track A — per-pod refactor of `sources/seattle_food_trucks/`.** `ripper.ts`
   now emits the merged calendar plus one calendar per declared pod, buckets
   bookings by pod via `POD_CONFIG`, and emits a non-fatal `Unknown pod …`
   `ParseError` for any Seattle pod absent from `POD_CONFIG`. `ripper.yaml`
   declares the merged calendar (`tags: ["Food"]`) plus **18 public pods**
   (each `tags: ["FoodTruck", "<Neighborhood>"]`, per-pod `geo`,
   `expectEmpty: true`). **7 pods are skipped** in `POD_CONFIG`: 4 suburban
   strays that slip the neighborhood filter (Black Raven Redmond/Woodinville,
   Statsig, Sunset Corporate — all Bellevue/Eastside) and 3 Seattle breweries
   (Broadview Tap House, Figurehead, Saleh's) deferred to dedicated rippers.
   `FoodTruck` added to `lib/config/tags.ts`. No `allowed-removals/` (merged
   calendar kept — see §Track A).
2. **Track B1 — `sources/external/tats-truck.yaml`** (Tat's Google Calendar ICS,
   verified 623 events), `sourceRole: venue`, `geo: null`, `tags: ["FoodTruck"]`.
3. **Track B2 — `docs/seattle-food-trucks-roster.md`**, the 831-truck lookup
   catalog pulled from `/api/trucks`. (Placed at `docs/` root, not
   `docs/source-candidates/`, to avoid colliding with the one-candidate-per-file
   schema there.) The StreetFoodFinder/Roaming Hunger aggregator investigation
   remains a documented follow-up — both 403 CI/residential IPs and need the
   proxy ladder.

This is a substantial behavioral change to a calendar source (new calendars,
new tag, new error path). Per the auto-merge rubric it's borderline — a reviewer
may reasonably want eyes on it — so treat auto-merge as not-automatic.

## 7. Open questions

- Do any StreetFoodFinder/Roaming Hunger per-truck pages expose ICS/JSON once
  past the 403? (Track B2 follow-up.)
- The merged `seattle-food-trucks` calendar still includes the few suburban
  brewery/campus pods that pass the neighborhood filter (pre-existing behavior,
  unchanged). Worth tightening its membership to the `POD_CONFIG` non-skip set
  later, but out of scope here.
