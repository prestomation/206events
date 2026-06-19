/**
 * General-purpose source fetch cache — throttles every source (rippers,
 * external ICS feeds, platform APIs) to at most one real network request per
 * cache key per rolling TTL window (default 24h).
 *
 * The build runs far more often than daily (schedule, push to main,
 * workflow_dispatch, and every PR preview), so without throttling every source
 * is fetched live on every build — many requests a day against hundreds of
 * upstreams whose content rarely changes between runs. This module stores each
 * fetched payload alongside a `fetchedAt` timestamp; the fetch layer
 * (lib/config/proxy-fetch.ts, via `withCache`) serves a cached copy when it is
 * younger than the TTL and only performs a real request when the entry is stale
 * or missing.
 *
 * Because the cached payload is re-parsed on every build (external ICS is parsed
 * normally; rippers re-run against cached page HTML/JSON), the events index
 * stays correct and — crucially — you can add a source or change parsing logic
 * and only pay the live fetch for a given URL once. Only the network call is
 * skipped, never the parse.
 *
 * Persistence transport is the GitHub Actions Cache (see build-calendars.yml),
 * but the authoritative freshness lives in each entry's `fetchedAt`, so the
 * transport is just a carrier. Same `{version, entries}` shape as geo-cache.json.
 */

import { readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";

export interface FetchCacheEntry {
  /** ISO timestamp of the last successful live fetch. */
  fetchedAt: string;
  /** HTTP status of the cached response. */
  status: number;
  /** Content-Type of the cached response. */
  contentType: string;
  /** The fetched payload (ICS text, page HTML, or JSON text). */
  content: string;
}

export interface FetchCache {
  version: number;
  /** Keyed by request key (see `keyFor`). */
  entries: Record<string, FetchCacheEntry>;
}

/** A live fetch that failed but was satisfied from a stale cached copy. */
export interface StaleServe {
  url: string;
  cachedAt: string;
  ageHours: number;
  error: string;
}

/**
 * Hard freshness cap: an entry younger than this is eligible to be served from
 * cache without a network call. Raised from 24h to 7 days so the build no longer
 * refetches every source the moment it crosses a day old (the "everything
 * expires at once" cliff). Freshness within the window is maintained instead by
 * proactive refresh of the oldest slice on main builds (see
 * `selectOldestEntriesForRefresh` + docs/cache-freshness-strategy.md).
 */
export const DEFAULT_TTL_HOURS = 24 * 7;

/** Entries older than this are dropped on save so removed sources / changed
 *  URLs don't accumulate forever in the persisted cache blob. */
export const MAX_ENTRY_AGE_DAYS = 30;

/**
 * TTL in milliseconds. Overridable via FETCH_CACHE_TTL_HOURS (eases testing and
 * manual cache busting — e.g. set a large value for a long local iteration
 * session, or 0 to force every source to refetch). A value of 0 makes every
 * entry stale.
 */
export function getCacheTtlMs(): number {
  const raw = process.env.FETCH_CACHE_TTL_HOURS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n * 60 * 60 * 1000;
  }
  return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
}

/**
 * Builds the cache key for a request. A plain GET with no body keeps the bare
 * URL as its key — the simplest, most common case, and back-compatible with the
 * URL-keyed cache format. Requests with a body (e.g. GraphQL/POST APIs) include
 * the method and a content hash of the body so different queries to the same
 * endpoint are distinct entries. Auth headers (API keys/tokens) are never part
 * of the key.
 */
export function keyFor(url: string | URL, init?: RequestInit): string {
  const urlStr = String(url);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body;
  if (method === "GET" && (body === undefined || body === null)) {
    return urlStr;
  }
  let key = `${method} ${urlStr}`;
  if (typeof body === "string" && body.length > 0) {
    key += `\n${createHash("sha256").update(body).digest("hex")}`;
  }
  return key;
}

export function emptyFetchCache(): FetchCache {
  return { version: 1, entries: {} };
}

export async function loadFetchCache(filePath: string): Promise<FetchCache> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.version === "number" &&
      typeof parsed.entries === "object" &&
      parsed.entries !== null
    ) {
      return parsed as FetchCache;
    }
    console.warn("fetch-cache.json has unexpected shape, starting with empty cache");
    return emptyFetchCache();
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return emptyFetchCache();
    }
    if (err instanceof SyntaxError) {
      console.warn(`fetch-cache.json is not valid JSON, starting with empty cache: ${err.message}`);
      return emptyFetchCache();
    }
    throw err;
  }
}

export async function saveFetchCache(cache: FetchCache, filePath: string): Promise<void> {
  await writeFile(filePath, JSON.stringify(cache, null, 2), "utf-8");
}

/** Drops entries older than `maxAgeMs` (default MAX_ENTRY_AGE_DAYS). Returns the
 *  number removed. Mutates `cache` in place. */
export function pruneCache(
  cache: FetchCache,
  nowMs: number,
  maxAgeMs: number = MAX_ENTRY_AGE_DAYS * 24 * 60 * 60 * 1000,
): number {
  let removed = 0;
  for (const [key, entry] of Object.entries(cache.entries)) {
    const fetchedAtMs = Date.parse(entry.fetchedAt);
    if (Number.isNaN(fetchedAtMs) || nowMs - fetchedAtMs > maxAgeMs) {
      delete cache.entries[key];
      removed++;
    }
  }
  return removed;
}

/** True when `entry` was fetched within the TTL window relative to `nowMs`. */
export function isFresh(entry: FetchCacheEntry, nowMs: number, ttlMs: number = getCacheTtlMs()): boolean {
  const fetchedAtMs = Date.parse(entry.fetchedAt);
  if (Number.isNaN(fetchedAtMs)) return false;
  return nowMs - fetchedAtMs < ttlMs;
}

// --- Module singleton wiring consumed by the fetch layer ---------------------
//
// The build injects a cache before the parallel rip/fetch phase and reads it
// back afterward. When no cache is injected (e.g. unit tests of an individual
// ripper, or any non-build caller), withCache behaves as a pass-through — no
// caching, every call hits the network.

let activeCache: FetchCache | null = null;
let staleServeLog: StaleServe[] = [];
// Keys to proactively refresh this build: treated as a forced cache miss in
// `lookupFreshEntry` even when still within the TTL, so they re-fetch live. The
// build computes this set (the oldest ~20%) on main builds only; empty
// otherwise. See selectOldestEntriesForRefresh + docs/cache-freshness-strategy.md.
let proactiveRefreshKeys: Set<string> = new Set();

/** Hit/miss telemetry for the fetch cache, surfaced in the build report so the
 *  cache's effectiveness is observable per build instead of inferred from
 *  wall-clock. `freshHits` were served from cache (no network); `liveFetches`
 *  hit the network because the entry was stale/missing; `liveFailures` are the
 *  subset of live fetches that threw (and then either stale-served or rethrew);
 *  `staleServes` were satisfied from an over-TTL copy after a live failure.
 *
 *  Proactive-refresh observability (main builds only; see
 *  docs/cache-freshness-strategy.md): `cacheSize` is the entry count of the
 *  loaded cache (M); `forcedRefresh` is how many keys were selected for
 *  proactive refresh (N, the oldest ~20% of M); `forcedRefreshApplied` is how
 *  many of those selected keys were *actually requested* this build (and thus
 *  force-missed → re-fetched). A large gap between `forcedRefresh` and
 *  `forcedRefreshApplied` means the refresh budget is landing on orphaned cache
 *  entries (detail pages, removed sources) that aren't re-requested. */
export interface FetchCacheStats {
  freshHits: number;
  liveFetches: number;
  liveFailures: number;
  staleServes: number;
  cacheSize: number;
  forcedRefresh: number;
  forcedRefreshApplied: number;
}

function emptyStats(): FetchCacheStats {
  return {
    freshHits: 0,
    liveFetches: 0,
    liveFailures: 0,
    staleServes: 0,
    cacheSize: 0,
    forcedRefresh: 0,
    forcedRefreshApplied: 0,
  };
}

let stats: FetchCacheStats = emptyStats();

export function initFetchCache(cache: FetchCache): void {
  activeCache = cache;
  staleServeLog = [];
  stats = emptyStats();
  stats.cacheSize = Object.keys(cache.entries).length;
  proactiveRefreshKeys = new Set();
}

/**
 * Select the oldest `fraction` of cache entries (by `fetchedAt`) to proactively
 * refresh. Pure function — returns the key set; the caller passes it to
 * `setProactiveRefreshKeys`. Entries with an unparseable `fetchedAt` sort oldest
 * (refreshed first). `fraction` is clamped to [0, 1]; the count rounds up so a
 * non-empty cache with a positive fraction always refreshes at least one entry.
 */
export function selectOldestEntriesForRefresh(cache: FetchCache, fraction: number): Set<string> {
  const clamped = Math.min(1, Math.max(0, fraction));
  if (clamped === 0) return new Set();
  const keys = Object.keys(cache.entries);
  if (keys.length === 0) return new Set();
  const count = Math.min(keys.length, Math.ceil(keys.length * clamped));
  const age = (k: string): number => {
    const t = Date.parse(cache.entries[k].fetchedAt);
    return Number.isNaN(t) ? -Infinity : t; // unparseable → oldest
  };
  const sorted = [...keys].sort((a, b) => age(a) - age(b)); // ascending: oldest first
  return new Set(sorted.slice(0, count));
}

/** Inject the set of keys to force-refresh this build (forced cache miss). */
export function setProactiveRefreshKeys(keys: Set<string>): void {
  proactiveRefreshKeys = keys;
  stats.forcedRefresh = keys.size;
}

export function getFetchCache(): FetchCache | null {
  return activeCache;
}

/** Test/teardown helper — clears the injected cache, stale-serve log, and stats. */
export function resetFetchCache(): void {
  activeCache = null;
  staleServeLog = [];
  stats = emptyStats();
  proactiveRefreshKeys = new Set();
}

export function recordFreshHit(): void { stats.freshHits++; }
export function recordLiveFetch(): void { stats.liveFetches++; }
export function recordLiveFailure(): void { stats.liveFailures++; }

/** Snapshot of the current counters. Read after the rip/fetch phase to report
 *  the cache hit rate. Independent of `drainStaleServes` (which clears the log),
 *  so the order of the two calls doesn't matter. */
export function getFetchCacheStats(): FetchCacheStats {
  return { ...stats };
}

/** Returns and clears the accumulated stale-serve log. */
export function drainStaleServes(): StaleServe[] {
  const out = staleServeLog;
  staleServeLog = [];
  return out;
}

export function recordStaleServe(serve: StaleServe): void {
  staleServeLog.push(serve);
  stats.staleServes++;
}

/** A cache entry for `key` that is still fresh, or undefined. A key selected for
 *  proactive refresh is treated as a miss so it re-fetches live this build. */
export function lookupFreshEntry(key: string, nowMs: number): FetchCacheEntry | undefined {
  if (!activeCache) return undefined;
  if (proactiveRefreshKeys.has(key)) {
    // A selected key that's actually requested this build — count it so we can
    // tell real (applied) refreshes from budget spent on orphaned entries.
    stats.forcedRefreshApplied++;
    return undefined;
  }
  const entry = activeCache.entries[key];
  if (entry && isFresh(entry, nowMs)) return entry;
  return undefined;
}

/** Any cache entry for `key`, fresh or stale (used for failure fallback). */
export function lookupAnyEntry(key: string): FetchCacheEntry | undefined {
  return activeCache?.entries[key];
}

export function storeEntry(key: string, entry: FetchCacheEntry): void {
  if (activeCache) activeCache.entries[key] = entry;
}
