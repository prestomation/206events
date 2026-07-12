# Food Truck Attribution Engine — Phase 2 Design (for sign-off)

**Status:** Design awaiting owner sign-off. No engine code written yet.
Parent plan: `docs/food-truck-attribution.md`. Prereq shipped: 10 per-truck
feeds (`docs/discovery-log/2026-07-11-food-truck-feeds.md`) + the anonymous SFT
per-pod baseline (`docs/seattle-food-trucks.md`).

**Goal:** turn the truck feeds' stops into **named per-pod schedules** — a pod
card that reads "Tat's, Where Ya At Matt @ Westlake Park, Wed 11–2" — while
keeping the anonymous SFT slot as the floor where no named truck covers a slot.

This doc exists to get the open decisions signed off *before* writing the
engine, per the owner's request.

## 1. Inputs & where the engine runs

A **post-rip build pass** (new `lib/food-truck-attribution.ts`, pure + unit
tested), invoked from `lib/calendar_ripper.ts` after all sources rip and before
tag aggregation — the same shape as cross-source dedup. Inputs:

1. **Pod registry** — physical pod locations with stable ids + coords: the SFT
   `POD_CONFIG` pods (already have coords) plus any confirmed discovered pods
   (see §3). Seeded, human-curated, stable.
2. **SFT per-pod slots** — the anonymous `Food Trucks @ <pod>` events already
   produced, keyed to a registry pod.
3. **Truck-feed stops** — every event from a `FoodTruck`-tagged truck source
   (the 10 feeds), each `(truck, date, start, end, locationString, coords)`.
   Feed coords come from the feed (`GEO:` / Squarespace `mapLat/mapLng`) or are
   geocoded from the address.

## 2. Algorithm

```
for each truck-feed stop:
    resolve stop coords (feed GEO, else geocode locationString)
    nearest = closest registry pod to coords
    if distance(nearest) <= MATCH_RADIUS_M:
        attribute stop -> nearest pod        # named appearance at a known pod
    else:
        emit stop as a "pod candidate"        # a location we don't model yet
# then, per registry pod, build the enriched calendar:
for each registry pod:
    named   = truck stops attributed to this pod
    floor   = SFT anonymous slots at this pod NOT covered by a named stop
              (a named stop within ±TIME_TOL of an SFT slot suppresses it)
    pod calendar events = named ∪ floor
```

- **Named event title:** `<Truck> @ <Pod>` (e.g. "Tat's Truck @ Westlake
  Park"); multiple trucks at the same pod/slot list each as its own event
  (users filter/subscribe per truck).
- **Per-truck calendars are unchanged** — a stop always stays in its truck's own
  feed, even if it matched no pod, so nothing is lost.

## 3. Open decisions — recommendations for sign-off

**D1 — Match radius (`MATCH_RADIUS_M`).** How close a stop must be to a registry
pod to count as "at" it. Trade-off: too tight misses geocoding jitter; too loose
attributes a truck to the wrong nearby pod (recall Westlake Center vs Park are
~50 m; 1201 vs 1551 Eastlake are 321 m).
→ **Recommend 120 m.** Tight enough to keep the Eastlake pods distinct, loose
enough for address-geocoding jitter. Feed `GEO:` coords (WYAM, Tat's) are exact,
so most matches are well inside it.

**D2 — Do discovered (non-registry) pods auto-get a calendar/URL?** Trucks park
at their own spots (Tat's stops were 596 m / 2,900 m from any SFT pod), so most
stops won't match. Auto-spawning a calendar per new cluster means unstable URLs
(they appear/vanish as feeds change) and machine-named pods.
→ **Recommend: no auto-spawn.** An unmatched stop (or a cluster of ≥N unmatched
stops from ≥2 trucks within `MATCH_RADIUS_M` of each other) surfaces as a
**`podCandidates` gap** in `build-errors.json` — same deterministic-detection
pattern as the unknown-pod detector. A human/skill confirms the name + coords
and adds it to the registry via PR. Only registry pods get calendars/URLs →
stable URLs, human-quality names. The stop still shows in the per-truck feed
meanwhile, so no data is lost.

**D3 — Floor/name reconciliation (`TIME_TOL`).** At a registry pod, when a named
truck stop and an anonymous SFT slot are the same real appearance, show the
named one and suppress the anonymous slot; otherwise keep the floor.
→ **Recommend: suppress an SFT slot when a named stop at the same pod overlaps
it within ±90 min.** Narrow enough that a lunch slot and a separate dinner slot
stay distinct. This reconciliation is **pod-scoped and explicit** (not the fuzzy
global cross-source dedup) — it only fires inside one registry pod's radius, so
the 596 m "SLU ≠ Dexter Yard" case never mis-merges.

**D4 — Relationship to the existing cross-source dedup.** The global dedup
(`lib/cross-source-dedup.ts`) already runs and would double-handle these. Two
options: (a) let the attribution pass run first and mark its outputs so the
global dedup skips food-truck-internal pairs; (b) fold the pod reconciliation
into the attribution pass and exclude `FoodTruck` calendars from the global
dedup. This also subsumes the same-ripper-pairs follow-up noted in
`docs/seattle-food-trucks.md`.
→ **Recommend (b):** the attribution pass owns all food-truck reconciliation;
`FoodTruck`-tagged calendars are excluded from the global dedup. Cleaner and
kills the 1201/1551-Eastlake candidate noise at the same time.

**D5 — Where do named events live?** Do they replace the SFT per-pod calendar's
events, or is there a parallel calendar?
→ **Recommend: enrich in place.** The existing `seattle-food-trucks-<pod>.ics`
calendars become the *named+floor* output; no new URLs, existing per-pod
subscribers get richer data. Per-truck calendars stay separate.

## 4. Reporting parity

New surfaces to plumb through all five reporting channels in the implementation
PR (per the Reporting Parity rule): a **`podCandidates`** queue (unmatched
clusters awaiting registry confirmation) and a stat for **named-vs-anonymous pod
coverage** (how many pod slots got a truck name). A draining skill
(`pod-registry-resolver`, or fold into build-report) confirms pod candidates.

## 5. Risks

- **Geocoding drift** on address-only stops → wrong-pod attribution; `MATCH_RADIUS_M`
  + the ZIP/neighborhood sanity checks from the dedup mitigate.
- **Feed sparsity** — only ~10 trucks feed this, so most pod slots stay
  anonymous (that's the floor's job).
- **Coupling** — the attribution pass reads multiple sources' outputs; it must
  be a pure function over already-ripped calendars, unit-tested with fixtures,
  to stay maintainable.

## 6. Phase 3 — curated Instagram set (out-of-band)

Instagram can't be fetched from CI (blocked IPs); the `instagram-source` skill
runs out-of-band (residential IP) and commits `instagram-cache.json` entries +
the source together. So the deliverable *here* is the curated list + onboarding,
not live events. **Policy: only add a truck whose IG feed currently has ≥1 live
upcoming event** — an empty feed is zero signal it will post later (and a
0-event source fails the build). So each truck below is added **enabled, seeded
with its live events, in one PR** from an out-of-band skill run — never parked
as a speculative empty/disabled source. Some of the six may not qualify at
onboarding time (no upcoming posts); those are simply skipped and re-checked
later.

**Curated marquee IG-only trucks (no machine-readable feed; handles verified via
SFT API):**

| Truck | IG handle |
|---|---|
| Marination | `curb_cuisine` |
| El Camion | `elcamionseattle` |
| Nosh | `noshthetruck` |
| Snout & Co | `snoutandco` |
| Kaosamai | `kaosamaithai` |
| Napkin Friends | `napkinfriends` |

**Onboarding (per truck):** run the `instagram-source` skill for the handle → it
reads feed posts (vision), writes dated/located entries to `instagram-cache.json`,
and adds a `type: instagram` source (`username: <handle>`, `tags: ["FoodTruck"]`,
`geo: null`) in the same PR **only if the feed has ≥1 live upcoming event**. Once
live, those stops flow into the attribution engine like any feed.

**Empirical result (2026-07 — bulk IG is PARKED).** All 6 curated marquee trucks
above turned out **dormant on their IG feed** (latest posts 6 months–5 years old;
Marination's handle dead), so per the live-events-only policy **none were seeded**.
A 120-truck recency sweep from this environment returned **0 successful fetches** —
Instagram rate-limits after a handful of requests per IP and then temporarily
blocks, so bulk discovery isn't practical from here. Where truck schedules
actually live is often **Stories** (need an auth cookie — inaccessible) or not on
the feed at all. **Conclusion:** Instagram feed is a low-yield, rate-limited
channel; don't invest in bulk harvesting. Add IG sources **opportunistically** —
only a specific truck confirmed to post dated schedules on its *feed*, one at a
time, via the `instagram-source` procedure in
`skills/instagram-source/SKILL.md`. A paid cookieless scraper API (ScrapeCreators
/ Apify) would bypass the rate limit for a real sweep, but the 6/6-dormant sample
makes the yield doubtful. Wiring `instagram-source` into the queue-drainer routine
is deferred until there are active IG sources to refresh.

## 7. Rollout after sign-off

1. Implement `lib/food-truck-attribution.ts` + fixtures/tests (D1–D5 as signed
   off). Wire into `lib/calendar_ripper.ts`; exclude `FoodTruck` calendars from
   global dedup. Plumb `podCandidates` + coverage stat through all five
   surfaces. **Manual-merge** (new shared infra).
2. Onboard the Phase 3 IG trucks out-of-band, a few per PR, cache-first.
