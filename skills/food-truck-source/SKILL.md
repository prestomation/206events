# 206.events Food Truck Source

Given a **food truck** — a link to its Instagram or website, or just its
name — get it correctly integrated into the food-truck system, or report why it
can't be. The end result is either "already covered, done", a draft PR adding it
as a properly-tagged food-truck source, or "no machine-readable schedule — not
viable (recorded)".

## When to use

- The user hands you a food truck's **Instagram URL, website URL, or name** and
  wants it on 206.events.
- You **discover a food truck** during other work and want to make sure it's set
  up correctly (this skill is also the checker — see step 5).

## The one principle

**The `FoodTruck` tag is what makes something a food truck here.** Any source
tagged `FoodTruck` (a) joins the citywide `tag-foodtruck.ics` aggregate, and
(b) — once the Phase 2 attribution engine ships
(`docs/food-truck-attribution-engine.md`) — has its stops geo-matched into the
per-pod schedules automatically, with no per-truck wiring. So the whole job is:
find the truck's schedule feed, add it as a source **tagged `FoodTruck`**, and
verify it produces live events. Everything downstream keys off that tag.

Trucks roam, so a truck source is always `sourceRole: venue` (first-party for
itself) with `geo: null`, and its own feed is **not** geo-filtered (a truck's
Bellevue/Everett stops stay in — subscribers follow the truck).

## Steps

### 1. Identify the truck and check coverage

Get the truck's name and, if given a name only, its site/socials from the
SeattleFoodTruck.com API (`/api/trucks/<slug>` → `website`, `instagram`). Check
it isn't already a source: `grep -ril "<name>" sources/` and the
`event-lookup` skill against the published feeds. If already covered, say so and
stop.

### 2. Find the machine-readable schedule feed

Pick by what the truck publishes (see `docs/food-truck-attribution.md` §2 for the
landscape — only ~1% of trucks have a clean feed, so "not viable" is a common,
fine outcome):

- **Website** — probe for a feed (`curl -A "Mozilla/5.0" -L`):
  - **Squarespace Events**: try the schedule page + common paths
    (`/schedule`, `/truckschedule`, `/events`, `/calendar`, `/locations`,
    `/find-us`) with `?format=json`; a hit has a non-empty `upcoming[]`.
  - **Google Calendar / ICS / Tribe Events**: grep the page for
    `calendar.google.com`, the legacy `www.google.com/calendar/embed?...src=`
    form, `.ics`, or `webcal://...?ical=1`. Rebuild a gcal id as
    `https://calendar.google.com/calendar/ical/<src>/public/basic.ics`; swap
    `webcal://`→`https://` for Tribe.
- **Instagram** — hand off to the **`instagram-source`** skill
  (`/instagram-source <handle>`). It reads the feed's flyers with vision and
  seeds `instagram-cache.json`. **Only add the source if the feed has ≥1 live
  upcoming event** (dormant/Stories-only feeds give zero confidence — see that
  skill and `docs/food-truck-attribution-engine.md` §6).
- **Neither** — no ingestible schedule. Record it as not-viable in
  `docs/seattle-food-trucks-roster.md` / a discovery-log entry and stop.

### 3. Add the source (tagged `FoodTruck`)

- **Google Calendar / ICS / Tribe feed** → `sources/external/<truck>.yaml`:
  ```yaml
  geo: null
  name: <truck>
  sourceRole: venue
  friendlyname: <Truck Name>
  description: <one sentence about the truck>
  icsUrl: "<the .ics URL>"
  infoUrl: "<site>"
  tags: [FoodTruck]
  ```
- **Squarespace Events** → `sources/<truck>/ripper.yaml`:
  ```yaml
  name: <truck>
  type: squarespace
  description: "<Truck Name>"
  url: "<schedule-page-url>"     # the ripper appends ?format=json
  friendlyLink: "<schedule-page-url>"
  sourceRole: venue
  cost: free
  geo: null
  tags: [FoodTruck]
  calendars:
    - name: <truck>
      friendlyname: "<Truck Name>"
      timezone: America/Los_Angeles
      tags: [FoodTruck]
  ```
- **Instagram** → the `type: instagram` source the `instagram-source` skill adds,
  with `tags: [FoodTruck]`.

### 4. Verify, then PR

```sh
ONLY_SOURCE=<truck> npm run generate-calendars
```

Confirm ≥1 upcoming event and 0 errors. **Never add a 0-event source** (fails the
build, and gives no confidence of future events). Then open a PR — external
ICS / Squarespace feeds are auto-merge-eligible calendar sources. Add a
discovery-log note (`docs/discovery-log/`) for provenance.

### 5. Checking an existing/discovered truck is set up right

A truck is correctly integrated iff: it has a source under `sources/`, that
source is tagged **`FoodTruck`**, and a scoped build produces ≥1 upcoming event.
If it's missing the tag, add it; if the feed is dead (0 events), disable the
source or mark it not-viable and note why.

## How it flows into the system

- **Immediately:** a per-truck calendar (`external-<truck>.ics` or
  `<truck>-<truck>.ics`) + membership in `tag-foodtruck.ics` (citywide) + the
  event shows on the site.
- **Once Phase 2 ships:** the attribution engine reads every `FoodTruck`-tagged
  calendar, geo-matches stops to pods, and the truck's name appears in the
  relevant **pod schedules** automatically. No extra step per truck.

## Related skills & docs

- **`skills/instagram-source/SKILL.md`** — read an Instagram feed's posts (vision)
  and seed the cache; the IG path of step 2.
- **`skills/source-discovery/SKILL.md`** — general new-source conventions and
  quality gates (this skill is the food-truck-specialized version).
- **`skills/source-from-event/SKILL.md`** — default handler for an event *poster*;
  hands off here when the "event" is really a truck to cover.
- **`skills/event-lookup/SKILL.md`** — check whether a truck/event is already
  covered (step 1).
- **Docs:** `docs/food-truck-attribution.md` (plan + feed landscape),
  `docs/food-truck-attribution-engine.md` (Phase 2 pod integration),
  `docs/seattle-food-trucks.md` (pods + `FoodTruck` tag),
  `docs/seattle-food-trucks-roster.md` (the 831-truck catalog).
