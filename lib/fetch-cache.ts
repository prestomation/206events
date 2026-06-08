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

export const DEFAULT_TTL_HOURS = 24;

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

export function initFetchCache(cache: FetchCache): void {
  activeCache = cache;
  staleServeLog = [];
}

export function getFetchCache(): FetchCache | null {
  return activeCache;
}

/** Test/teardown helper — clears the injected cache and stale-serve log. */
export function resetFetchCache(): void {
  activeCache = null;
  staleServeLog = [];
}

/** Returns and clears the accumulated stale-serve log. */
export function drainStaleServes(): StaleServe[] {
  const out = staleServeLog;
  staleServeLog = [];
  return out;
}

export function recordStaleServe(serve: StaleServe): void {
  staleServeLog.push(serve);
}

/** A cache entry for `key` that is still fresh, or undefined. */
export function lookupFreshEntry(key: string, nowMs: number): FetchCacheEntry | undefined {
  if (!activeCache) return undefined;
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
