---
name: cost-resolver
description: Backfill missing event costs in 206.events. Reads the costGaps work queue from build-errors.json and, in bounded batches, fills source-wide free venues via YAML `cost:` PRs and per-event prices via the event-uncertainty-cache (--cost-* flags), or marks them unresolvable when pricing is genuinely not published.
---

# 206.events Cost Resolver

Backfill admission costs for events that don't have one. The data model is
`cost: { min, max? } | { paid: true }` — USD **face value, excluding fees**;
`min: 0` means free; `{ paid: true }` means "ticketed, amount unknown".

There are two kinds of fix:

| Gap | Where it lives | How to fix |
|---|---|---|
| **Source-wide** (a venue/series that is always free, or always one price) | `cost:` in the source YAML (ripper / per-calendar / external / recurring) | Open a PR adding `cost: free` or `cost: <n>` (like photo-resolver adds `imageUrl:`) |
| **Per-event** price | `event-uncertainty-cache.json` keyed `source:eventId` | Write a `cost` resolution via `uncertainty-cache.py resolve --cost-*` (committed file) |

Both are **non-fatal** todo queues, like geo, photos, and event-uncertainty.
The queue self-limits: once a cost is found (or pricing confirmed unpublished
and marked `unresolvable`), the item drops off.

## Pricing rubric

**`min` = the least a general-admission adult can pay and still get in.**
Apply these rulings consistently — they are the contract shared by ripper
code, YAML annotations, and every resolution you write:

| Situation | Ruling |
|---|---|
| Suggested donation / pay-what-you-can / NOTAFLOF ("no one turned away for lack of funds") | free (`--cost-free`); the suggested amount stays in the description |
| Sliding scale "$5–25" | `--cost-min 5` (unless NOTAFLOF is stated → free) |
| "Free for members, $15 general" | anchor on **general-admission adult**: `--cost-min 15`; member, child, senior, and student tiers are ignored |
| "$10 advance / $15 door" | advance price: `--cost-min 10` |
| Free entry, paid activities inside (festivals, markets) | cost = cost to walk in = free |
| Ticketing fees | excluded — face value only (matches Ticketmaster `priceRanges` semantics) |
| Page confirms tickets but no price posted ("ticketed", "price TBA") | `--cost-paid-unknown` |
| Pricing looks volatile or ambiguous | prefer `--cost-paid-unknown` over recording a guess |

## Workflow

### 1. Check the queue and baseline coverage

Fetch the build health report and note the coverage — your **baseline to beat**:

```bash
curl -s https://206.events/build-errors.json | python3 -c "
import json,sys
d = json.load(sys.stdin)
s = d.get('costStats', {})
print(f\"coverage: {s.get('eventsWithCost')}/{s.get('totalEvents')} events, {s.get('freeEvents')} free, {s.get('unresolvable')} unresolvable\")
print(f\"gaps: {len(d.get('costGaps', []))}\")
"
```

List the gaps, grouped by source (sources with many gaps are YAML-default or
ripper-extraction candidates; scattered one-offs are cache resolutions):

```bash
curl -s https://206.events/build-errors.json | python3 -c "
import json,sys,collections
d = json.load(sys.stdin)
by = collections.Counter(g['source'] for g in d.get('costGaps', []))
for src, n in by.most_common(25): print(f'{n:5}  {src}')
"
```

(Use `output/build-errors.json` for a local build, or
`https://206.events/preview/<PR>/build-errors.json` for a PR preview.)

### 2. Process a bounded batch

**Do not try to drain the whole queue in one run.** Pick a batch — e.g. the
first **25** events, or 2–3 high-gap sources — and resolve those. Prefer
source-wide fixes first (one YAML line covers every future event at that
source) and high-traffic sources.

### 3a. Resolve a SOURCE-WIDE cost (source YAML → PR)

If investigation shows a source's events are uniformly priced (most commonly:
always free — community calendars, farmers markets, gallery walks):

1. Verify on the source's site that admission is uniformly free (or a flat
   price) across its events — not just for the sampled one.
2. Add `cost: free` (or `cost: <n>`) to the source YAML:
   - ripper: `sources/<name>/ripper.yaml` (ripper-level, or per-calendar for a
     multi-branch source)
   - external: `sources/external/<name>.yaml`
   - recurring: `sources/recurring/<name>.yaml`
3. Open a PR (content changes — auto-merge-eligible per AGENTS.md).

The YAML default never overrides a ripper-parsed or cache-resolved cost
(precedence: ripper-parsed → cache resolution → YAML default).

### 3b. Resolve a PER-EVENT cost (uncertainty cache)

For each event gap, fetch the source page (`url` from the queue), apply the
pricing rubric, and write the resolution:

```bash
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
  --key "<source>:<eventId>" --cost-min 15 --cost-max 45 \
  --evidence "<source page url>"
```

Free events: `--cost-free`. Ticketed with no posted price:
`--cost-paid-unknown`.

If the page genuinely publishes **no pricing signal at all** (no price, no
"ticketed", no RSVP link), mark it unresolvable so it drops off the queue:

```bash
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
  --key "<source>:<eventId>" --unresolvable --reason "no pricing published"
```

**Caution:** the cache's `unresolvable` flag is entry-global — it also stops
photo backfill and acknowledges any open uncertainty for that event. Only use
it when the event page is a dead end overall; prefer `--cost-paid-unknown`
when the page is alive but priceless.

The build's `applyCostBackfill` pass applies these resolutions on the next
build (see `docs/free-paid-filter.md` and `docs/event-uncertainty.md`).

### 4. Re-trigger the build and report

After YAML PRs merge / cache resolutions are written, re-trigger the build,
then re-check coverage against your baseline. Summarize:

- Cost coverage before vs after
- How many YAML PRs opened, how many cache resolutions written
- How many marked `--cost-paid-unknown` vs exact prices vs unresolvable
- Remaining gap count

## Notes

- **Never guess.** A price you didn't see on the page is a guess that looks
  like a fact. `--cost-paid-unknown` is always available and always honest.
- **Prices drift.** $15 becomes $20 all the time. Pass `--fingerprint` when
  the queue entry shows one, so upstream price changes invalidate the entry.
- Cache resolutions edit the committed `event-uncertainty-cache.json`;
  commit them in the same PR (CI reads the committed file — no S3). See
  `docs/github-native-caches.md`.
- This skill is the handler invoked from the build-report skill's Cost
  Coverage Check (step 5.7).
