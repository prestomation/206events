# Food Truck Attribution — Named Per-Pod Schedules from Truck Feeds

**Status:** Design / implementation plan (not yet implemented). Builds on
`docs/seattle-food-trucks.md` (the shipped per-pod + per-truck baseline).

**Goal:** Move per-pod food-truck calendars from anonymous
`Food Trucks @ <pod>` slots (all SeattleFoodTruck.com gives us) toward
**named** schedules — "Tat's, Where Ya At Matt @ Westlake Park, Wed 11–2" —
by ingesting each truck's *own* feed and attributing its stops to pods
ourselves.

## 1. Why pivot the per-truck side

`docs/seattle-food-trucks.md` §3 established that SeattleFoodTruck.com's API is
pod-keyed only — it never says *which* truck is at a slot. So the shipped
per-pod calendars are anonymous ("there will be food trucks here"). The richer
model is to invert it: pull each truck's published schedule, and match its stops
to pods on our side. That yields per-truck calendars *and* named per-pod
calendars from the same data.

The catch is data availability. This plan is grounded in research (2026-07),
not optimism.

## 2. Research findings (what's actually out there)

### 2a. Machine-readable truck feeds are rare (~5%)

Sample of 20 active, well-known trucks + 8 spot-checks of the roster
(`docs/seattle-food-trucks-roster.md`):

| Source type | Share of sample | Rough est. of 831 |
|---|---|---|
| Machine-readable dated feed (Google Cal ICS / Squarespace-JSON) | **~5%** | ~15–40 |
| Website schedule page, no feed | ~10% | ~80 |
| Social / brochure only (mostly Instagram) | ~75% | ~600 |
| Nothing discoverable / dead site | ~10% | ~80 |

A clean feed is ~1 in 20 even among the *good* trucks. Two confirmed examples:

- **Tat's Truck** — public Google Calendar ICS (already shipped as
  `sources/external/tats-truck.yaml`). Carries street addresses in `LOCATION`.
- **Where Ya At Matt** — Squarespace **Events** collection:
  `https://www.whereyaatmatt.com/truckschedule?format=json` returns upcoming
  dated, geolocated stops; per-event `?format=ical` carries `GEO:`. (The
  collection-level `?format=ical` is disabled — ingest via JSON.)

**Efficient discovery filter:** don't hand-visit 831 sites. For each truck with
a website, probe `<site>/<schedule-path>?format=json` for a Squarespace
`typeName: events` collection, and grep the homepage for `calendar.google.com`
/ `.ics` / `webcal://`. That query finds the ~15–40 feeds cheaply.

**Freshness caveat:** a feed existing ≠ a feed being current. Tat's had only 2
stops in the next 30 days at time of writing. Expect staleness and stale-serve
handling (the fetch-cache already does last-good fallback).

### 2b. The Instagram ripper is a cache *reader*, not an extractor

`lib/config/instagram.ts` has **zero** caption/date/location parsing. It reads
`instagram-cache.json`, which is populated **out-of-band by an LLM+vision pass**
(the `instagram-source` skill scraping `i.instagram.com/api/v1/.../web_profile_info`,
rate-limited, GHA-IP-blocked so never in CI). Consequences for trucks:

- It **can** publish dated, located truck events — the existing itinerant
  sources (`freeze-tag-events`, `mixmix-socials`) prove the "mobile host,
  rotating venues" shape works.
- But it is **not a live feed** — only as fresh as the last skill run, one
  LLM+vision pass per truck per refresh, each committed via PR.
- **Stories are inaccessible** (no auth cookie) — and many trucks post their
  daily spot only in Stories.
- Daily-cadence trucks fan a week of stops into many cache entries by hand.
- Neighborhood-only captions ("SLU today") store a loose string that geocodes
  imprecisely, flagged uncertain.

Verdict: Instagram is viable **selectively** (curated marquee trucks), not for
the ~600-truck social-only tail.

### 2c. Attribution is geo-clustering, not lookup

Trucks park at their *own* spots, not SFT-managed pods. Tat's two upcoming stops
were **596 m and 2,900 m** from the nearest SFT pod. So we can't "match a stop to
SFT's pod list." Pods must be **discovered by clustering truck stops** (seeded
with SFT's named pods where they coincide). Feed locations range from clean
addresses (Tat's, Where Ya At Matt `GEO:`) to neighborhood names — clustering is
reliable for the former, fuzzy for the latter.

## 3. Decided architecture — hybrid, phased

Two decisions from the owner:

- **Keep SFT as the floor; layer names on top.** SFT's anonymous bookings stay
  as the per-pod baseline (only ~5% of trucks have feeds, so a feeds-only model
  would leave most pod-days blank). Truck-feed names *enrich* a pod where they
  match; they don't replace the floor.
- **Feeds + selective Instagram.** Harvest the ~15–40 real feeds and build the
  attribution engine first; add Instagram only for a curated set of marquee
  trucks.

### Components

**Pod registry.** The canonical set of physical pods = SFT pods
(`POD_CONFIG` in `sources/seattle_food_trucks/ripper.ts`, with coords) **plus**
pods discovered by clustering truck-feed stops. Each pod: id, name, coords,
neighborhood, source(s). SFT seeds named pods; truck stops reveal new ones.

**Phase 1 — Harvest machine-readable feeds (high ROI, low effort).**
- A discovery sweep (subagent-friendly) over the roster using the §2a filter →
  the ~15–40 trucks with feeds.
- Each becomes a per-truck source: external ICS (like Tat's) for Google-Cal
  feeds, or a small `JSONRipper` for Squarespace `?format=json` Events (like
  Where Ya At Matt). `sourceRole: venue`, `geo: null`, tags `["FoodTruck", …]`,
  no geo-filter on a truck's own feed.
- Deliverable: per-truck calendars for feed-havers, immediately.

**Phase 2 — Pod-attribution engine.**
- Collect every stop `(truck, date, startTime, locationString, coords?)` from
  the harvested feeds. Geocode where `coords` absent.
- Cluster stops by proximity (e.g. ~75–100 m), seeded with pod-registry coords
  so a cluster near a known pod inherits its name; unseeded clusters become new
  pod candidates surfaced for review.
- Emit **named per-pod calendars**: for each pod, the trucks whose stops
  clustered there, titled with the truck name(s).
- Unclustered one-off stops (private caterings) stay in the per-truck feed only.
- This is new shared infrastructure (a `lib/` module + tests), so it's a
  **manual-merge** change and gets its own design iteration.

**Phase 3 — Instagram (selective).** Use the out-of-band `instagram-source`
skill for a curated list of marquee trucks that only post on IG. Each becomes a
`type: instagram` source; the skill drains posts into `instagram-cache.json` via
PR. Explicitly **not** applied to the ~600-truck tail.

### How the floor and the names reconcile at a pod

A pod card can show up to two layers for a given day/time:
1. **SFT floor** — the anonymous `Food Trucks @ <pod>` slot (a truck is booked).
2. **Named** — specific trucks whose feeds place them at (or near) that pod/time.

When a named truck matches an SFT slot at the same pod/time, prefer the named
entry (cross-source dedup already picks a canonical; a truck feed is a `venue`).
When no truck feed covers a slot, the floor stands. This is the "layer names on
top" contract, and it must be spelled out in the attribution engine's dedup
rules so a named appearance suppresses the matching anonymous slot rather than
duplicating it.

## 4. Risks & honest expectations

- **Coverage is bounded by feeds.** Realistic outcome: named per-pod schedules
  for ~15–40 trucks + a few marquee IG trucks; anonymous SFT floor everywhere
  else. Not a citywide named schedule.
- **Matching errors** put a truck at the wrong pod. Mitigate with a tight
  cluster radius, ZIP/neighborhood sanity checks, and surfacing low-confidence
  clusters for review rather than auto-publishing them.
- **Feed rot & staleness** — surfaced via the existing fetch-cache stale-serve
  path and zero-event/`expectEmpty` handling.
- **Instagram cost** — every refresh is an LLM+vision pass + PR. Keep the
  curated list small; measure before growing.
- **Reporting parity** — any new gap queue (e.g. "unclustered truck stop",
  "new pod candidate") must be plumbed through all five reporting surfaces in
  the same PR (per the Reporting Parity rule).

## 5. Rollout

1. **This effort's shipped baseline (PR #908):** anonymous SFT per-pod + Tat's
   per-truck feed + roster. Unchanged by this plan.
2. **Phase 1 PR(s):** feed-discovery sweep results + per-truck sources for the
   harvested feeds (Where Ya At Matt first — a `JSONRipper` for the Squarespace
   Events endpoint). Auto-merge-eligible (calendar sources).
3. **Phase 2 PR:** the attribution engine (`lib/` module + tests) and the
   named per-pod output + floor/name dedup contract. Manual-merge (new shared
   infrastructure).
4. **Phase 3 PRs:** curated Instagram truck sources, one or a few at a time.

## 6. Open questions

- Cluster radius and the confidence bar for auto-publishing a discovered
  (non-SFT-seeded) pod vs. queuing it for review.
- Whether discovered pods get their own calendars/URLs immediately or only once
  a human confirms the name (URL stability vs. freshness).
- The exact dedup rule when a named truck stop and an SFT anonymous slot are the
  same real appearance but geocode >75 m apart (Tat's "SLU" was 596 m from the
  Dexter Yard pod — same neighborhood, different point).
- Which trucks make the initial curated Instagram list.
