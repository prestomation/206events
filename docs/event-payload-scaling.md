# Event Payload Scaling — Format Benchmarks & Streaming Plan

**Status: steps 1–2 implemented (same PR); step 3 is a staged follow-up.**
The build applies the per-event past filter (`filterPastIndexEvents`) and
emits the streaming pair (`events-index.ndjson` + `event-descriptions.json`,
`buildEventsIndexStream` in `lib/discovery.ts`); the web client streams the
NDJSON through the search worker with progressive batch rendering and
fetches the description dictionary lazily (`loadFullEventsIndex` in
`web/src/App.jsx`, stream protocol in `web/src/lib/searchWorker.js` /
`searchClient.js`). `events-index-soon.json` and the monolithic
`events-index.json` still ship: the soon file remains phase 1 of boot, and
the monolithic file is both the client's fallback (pre-stream deploys /
no-stream responses) and the unchanged canonical discovery resource for the
favorites Worker and LLM consumers. Retiring the soon file (step 3) waits
until the stream path has proven itself in production.

Measurements are reproducible with
`node scripts/bench-event-payload.mjs` (defaults to downloading the live
production index). Numbers below are from production data on 2026-07-06:
**12,521 events, 11,052 KB (10.8 MB) raw** — up from 9,369 KB / 11,220
events in the June pass
([`web-performance-2026-06.md`](./web-performance-2026-06.md)), i.e. ~18%
byte growth (+12% events) in one month. The question this document answers: **how
does the event payload vertically scale to "all events into the future",
and is a non-JSON / streaming format the way to get there?**

All timings are desktop Node; a mid-range phone runs the same JS roughly
3–5× slower.

## TL;DR

1. **Binary formats are disproven.** MessagePack, CBOR, and columnar
   variants are *larger* than JSON after Brotli and decode *no faster*
   than native `JSON.parse`. Don't switch serialization formats.
2. **Streaming is the real win, and it's free.** NDJSON compresses to the
   *identical* size as the JSON array. Date-sorted, the first week of
   events is fully parseable after **146 KB** of the compressed stream
   (description-free variant) — and that number is a property of the
   *window*, not the corpus, so first-paint cost stays constant as the
   index grows without bound.
3. **`description` is the scaling liability** — 40% of bytes, 71%
   duplicated text, needed only by the detail view and search. Move it
   out of the boot-critical file into a lazily-fetched side file.
4. Cheap orthogonal win: the index ships **740 past events** (6% of rows)
   because the future-events filter is per-*calendar*, not per-event.

## 1. Is there a better format than JSON? (No.)

Sizes for the same 12,521 events across candidate encodings
(brotli-9 approximates what Cloudflare serves):

| Format | raw | gzip | brotli |
|---|---|---|---|
| **JSON array (current)** | 11,052 KB | 2,507 KB | **861 KB** |
| NDJSON (one event per line) | 11,052 KB | 2,507 KB | **861 KB** |
| JSON minus `description` | 6,601 KB | 1,084 KB | 435 KB |
| Columnar JSON (struct-of-arrays) | 9,900 KB | 1,811 KB | 886 KB |
| MessagePack (rows)¹ | 10,347 KB | 2,628 KB | 897 KB |
| CBOR (rows)¹ | 9,222 KB | 2,529 KB | 871 KB |
| MessagePack columnar + dict-encoded¹ | 8,061 KB | 1,810 KB | 896 KB |

¹ optional section of the bench script (`npm i --no-save @msgpack/msgpack cbor-x`).

Full-corpus decode time (median of 7):

| Decode | time |
|---|---|
| `JSON.parse` | 22 ms |
| NDJSON split + per-line parse | 29 ms |
| `JSON.parse`, no description | 17 ms |
| Columnar parse + rehydrate to row objects | 31 ms |
| MessagePack decode¹ | 67 ms |
| CBOR decode (cbor-x)¹ | 32 ms |

Two structural reasons, worth recording so this doesn't get re-litigated:

- **Brotli already exploits the redundancy** that binary/columnar formats
  target (repeated keys, repeated venue strings, near-identical dates).
  What remains after compression is mostly *unique text entropy* —
  descriptions, titles, URLs — which no serialization format shrinks.
  Even epoch-encoding both date fields (−760 KB raw) changed the brotli
  size by **+1 KB**.
- **`JSON.parse` is native C++**; MessagePack/CBOR decoders are JS.
  A format that "parses faster than JSON" in benchmarks usually means
  zero-copy access without materializing objects (FlatBuffers, Arrow) —
  but our consumers (Fuse index build, React rows, Leaflet markers)
  need real JS objects, so materialization cost comes back in full,
  plus a bundle-size cost for the decoder library.

**Verdict:** keep JSON *syntax*. Change the *shape and delivery*, not the
serialization.

## 2. Streaming: NDJSON costs nothing and changes the scaling class

NDJSON (newline-delimited JSON) compresses to the same size (identical
at KB granularity — raw, it's 2 bytes smaller than the array form),
parses with the same native `JSON.parse` per line (+6 ms total overhead),
and — unlike a JSON array — is **incrementally parseable**: the client can
consume `fetch().body` through a `TextDecoderStream`, split on newlines,
and hand fully-usable events to the UI while the rest of the file is
still in flight. (The browser natively decompresses `Content-Encoding:
br/gzip` streams, so compressed prefixes are exactly what arrives.)

Sort the file by start date and the prefix property does the windowing:

| Window | events | compressed prefix (with desc) | prefix, no-desc variant |
|---|---|---|---|
| first 2 days | 1,431 | 179 KB | **77 KB** |
| first 7 days | 3,034 | 322 KB | **146 KB** |
| first 14 days | 4,847 | 451 KB | 205 KB |
| first 30 days | 6,878 | 587 KB | 272 KB |
| whole file | 12,521 | 861 KB | 435 KB |

(Prefix sizes are each window compressed independently — an approximation
of the true prefix-of-one-stream cost, accurate to within a brotli block
boundary, i.e. a few KB at these sizes.)

Compare with today's two-phase load (`events-index-soon.json` 127 KB br +
full 861 KB br = 988 KB total, with the soon bytes re-downloaded inside
the full file, plus a wholesale corpus *swap* on the main thread when
phase 2 lands): a single date-sorted, description-free NDJSON stream
reaches first-week paint at ~146 KB — the same ballpark as the soon file
— then **keeps filling in continuously** with no swap moment, no
duplicate bytes, and no monolithic parse block. The soon/full split,
`fullEventsLoaded` state, and swap re-render all become unnecessary.

**Why this is the vertical-scaling answer:** every cost in today's
architecture is O(corpus) — download, parse, worker `structuredClone`
transfer, swap re-render. With a date-sorted stream, time-to-interactive
is O(*window the user is looking at*). The corpus can grow 10× and the
first-week paint cost doesn't move; the tail of the stream arrives and
indexes in the background at whatever pace the network allows.

Measured scaling of the *current* whole-file approach (corpus multiplied
synthetically; parse is desktop — multiply ~4× for mobile, and the worker
hand-back `structuredClone` costs about the same again):

| events | raw | brotli | `JSON.parse` | no-desc parse |
|---|---|---|---|---|
| 12,521 (today) | 10.8 MB | 861 KB | 23 ms | 17 ms |
| 25,042 | 21.6 MB | 1.6 MB | 52 ms | 39 ms |
| 50,084 | 43.3 MB | 3.2 MB | 123 ms | 87 ms |
| 100,168 | 86.6 MB | 6.4 MB | 257 ms | 182 ms |

(The synthetic corpus perturbs only `summary` per copy, so descriptions
repeat across copies; because the corpus far exceeds brotli's match
window the compressed sizes still scale essentially linearly, but treat
the brotli column as a lower bound for a genuinely diverse corpus.)

At 100k events the whole-file path is a 6.4 MB download and ~1 s of
mobile parse + ~1 s of clone-back — per visit. The streaming path at
100k events still paints the first week after ~150 KB.

## 3. `description` is the payload's scaling liability

Field-level byte shares (raw): `description` **40.4%**, `imageUrl` 9.2%,
`url` 8.5%, `location` 6.4%, dates 11.3%, everything else ≤5% each.
Beyond being the biggest field, description text is **massively
duplicated**: 12,521 events carry only **3,580 unique descriptions**
(recurring series and multi-date runs repeat the same blurb) — 2.3 MB of
raw duplication. Brotli absorbs most of the duplication on the wire, but
the client still pays for every copy in `JSON.parse` time, worker
transfer, and heap.

Who actually needs descriptions?

- **Detail view** (`web/src/redesign/views.jsx`) — one event at a time.
- **Live search** (worker, keys `summary, description, location`) — needs
  the text, but off the main thread and not at boot.
- **Favorites worker** (`event-search.ts`, parity-locked) — server-side,
  reads the published file; size is a non-issue there.
- Nothing else. List rows, map, grouping, counts: all description-free.

So the description bytes sit on the boot-critical path purely as a
carrier for lazy consumers. Splitting them out:

| File | brotli |
|---|---|
| Core: date-sorted NDJSON, events carry `d` = index into dictionary | **448 KB** |
| `event-descriptions.json`: the 3,580 unique strings | 392 KB |

Because the two files cross-reference by array index, the stream's first
line is a metadata header (`{"format":"events-stream/1","generated":…}`)
and the dictionary carries the same `generated` stamp — consumers reject
a mixed-generation pair (a deploy landing between the two fetches would
otherwise silently attach wrong text).

Total transfer is roughly unchanged (840 vs 861 KB) — the win is *when*
the bytes load: the 392 KB dictionary is fetched lazily by the search
worker (search over descriptions lights up a few seconds later —
progressive enhancement) and by the detail view, never blocking boot,
never crossing the worker→main-thread boundary at all for search.

## 4. Waste audit (orthogonal quick wins)

- **740 past events (6% of rows, 97 KB brotli, oldest Nov 2025).** Root
  cause: the index includes every event of any calendar that has *at
  least one* future event (`calendarsWithFutureEvents` gate in
  `lib/calendar_ripper.ts` — per-calendar, not per-event). The client
  filters them out on every render (`upcomingIndexEvents`). Fix at the
  build: skip events whose `endDate` is >24 h past (same grace the soon
  builder uses). One guard clause; verify nothing consumes past entries
  (the recurring-dates "other dates" grouping shows *upcoming* dates
  only, but confirm before shipping).
- **1,058 dedup-suppressed rows** ship complete payloads including
  descriptions. They're needed for attribution chips and "also listed
  by", but their descriptions are never rendered (the canonical row's
  is). Compressed savings are small (brotli dedupes them against the
  canonical copy — measured −15 KB) so this is *not* worth doing for
  size alone; it falls out naturally with the description dictionary
  (suppressed rows just share the canonical's `d`).
- **`endDate` on every row** (5.8%): derivable client-side only if the
  duration were shipped instead; both cost about the same compressed.
  Not worth it.
- **Far-future noise:** the horizon currently reaches June 2029; per-month
  volume past +90 days is tiny (tens of KB). Sharding by month was
  considered and rejected: it multiplies requests and cache entries to
  optimize bytes the prefix-stream already defers.

## 5. Recommended plan

Phased so each step is independently shippable and testable; the
boot-profile CI harness (`docs/web-boot-profiling-ci.md`) is the
regression guard for all of them.

1. **Per-event future filter at build time** (small, no format change):
   drop events ended >24 h before build from `events-index.json`.
   −740 rows / −97 KB br today; prevents unbounded accumulation of
   history inside long-lived calendars. Audit consumers first (web,
   favorites worker feed windowing, event-lookup skill).
2. **Ship `events-index.ndjson`** — date-sorted, description-free, events
   carrying a `d` dictionary reference — plus `event-descriptions.json`,
   alongside the existing files (the discovery-API contract keeps
   `events-index.json` unchanged for LLM/worker consumers, exactly as the
   soon-split did). The search worker consumes the stream incrementally
   (`TextDecoderStream` + line split), posting batches to the main thread
   (e.g. every 500 events / 100 ms) so rendering fills in progressively;
   it fetches the description dictionary afterwards and re-indexes.
3. **Retire `events-index-soon.json` and the swap machinery** once the
   stream path is proven (allowed-removals entry + llms.txt/index.json
   updates). Single source of truth for the client again.
4. **Favorites worker parity:** the worker keeps reading
   `events-index.json` (unchanged file, unchanged Fuse keys). If/when it
   moves to core+dictionary, that lands as its own PR touching both
   `event-search.ts` and the client per the parity rule.

Non-goals, with the measurements that killed them: MessagePack/CBOR/
columnar (§1), epoch-encoded dates (+1 KB br), month sharding (§4),
pre-built Fuse index (June pass: 5 MB download to save 52 ms of build
that's already off-thread).

## Re-running the numbers

```sh
node scripts/bench-event-payload.mjs                      # live prod data
node scripts/bench-event-payload.mjs path/to/saved.json   # offline
npm i --no-save @msgpack/msgpack cbor-x                   # optional: binary-format rows
```
