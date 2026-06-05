/**
 * Browserbase fetch cache — throttles `proxy: browserbase` sources to at most
 * one real Browserbase API call per URL per rolling 24h window.
 *
 * Browserbase (proxy rung 3) is billed per request. The build runs far more
 * often than daily (schedule, push to main, workflow_dispatch, and every PR
 * preview), so without throttling each browserbase source is fetched live on
 * every build. This module stores each fetched payload alongside a `fetchedAt`
 * timestamp; the fetch layer (lib/config/proxy-fetch.ts) serves a cached copy
 * when it is younger than the TTL and only performs a real Browserbase call
 * when the entry is stale or missing.
 *
 * Because the cached payload is re-parsed on every build (external ICS is
 * parsed normally; the dacha ripper re-runs against cached page HTML), the
 * events index stays correct — only the network call is skipped.
 *
 * Persistence transport is the GitHub Actions Cache (see build-calendars.yml),
 * but the authoritative freshness lives in each entry's `fetchedAt`, so the
 * transport is just a carrier. Same `{version, entries}` shape as geo-cache.json.
 */

import { readFile, writeFile } from "fs/promises";

export interface BrowserbaseCacheEntry {
  /** ISO timestamp of the last successful live Browserbase fetch. */
  fetchedAt: string;
  /** HTTP status of the cached response. */
  status: number;
  /** Content-Type of the cached response. */
  contentType: string;
  /** The fetched payload (ICS text or page HTML). */
  content: string;
}

export interface BrowserbaseCache {
  version: number;
  /** Keyed by request URL. */
  entries: Record<string, BrowserbaseCacheEntry>;
}

/** A live fetch that failed but was satisfied from a stale cached copy. */
export interface StaleServe {
  url: string;
  cachedAt: string;
  ageHours: number;
  error: string;
}

export const DEFAULT_TTL_HOURS = 24;

/**
 * TTL in milliseconds. Overridable via BROWSERBASE_CACHE_TTL_HOURS (eases
 * testing and manual cache busting). A value of 0 makes every entry stale.
 */
export function getCacheTtlMs(): number {
  const raw = process.env.BROWSERBASE_CACHE_TTL_HOURS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n * 60 * 60 * 1000;
  }
  return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
}

export function emptyBrowserbaseCache(): BrowserbaseCache {
  return { version: 1, entries: {} };
}

export async function loadBrowserbaseCache(filePath: string): Promise<BrowserbaseCache> {
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
      return parsed as BrowserbaseCache;
    }
    console.warn("browserbase-cache.json has unexpected shape, starting with empty cache");
    return emptyBrowserbaseCache();
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return emptyBrowserbaseCache();
    }
    if (err instanceof SyntaxError) {
      console.warn(`browserbase-cache.json is not valid JSON, starting with empty cache: ${err.message}`);
      return emptyBrowserbaseCache();
    }
    throw err;
  }
}

export async function saveBrowserbaseCache(cache: BrowserbaseCache, filePath: string): Promise<void> {
  await writeFile(filePath, JSON.stringify(cache, null, 2), "utf-8");
}

/** True when `entry` was fetched within the TTL window relative to `nowMs`. */
export function isFresh(entry: BrowserbaseCacheEntry, nowMs: number, ttlMs: number = getCacheTtlMs()): boolean {
  const fetchedAtMs = Date.parse(entry.fetchedAt);
  if (Number.isNaN(fetchedAtMs)) return false;
  return nowMs - fetchedAtMs < ttlMs;
}

// --- Module singleton wiring consumed by the fetch layer ---------------------
//
// The build injects a cache before the parallel rip/fetch phase and reads it
// back afterward. When no cache is injected (e.g. unit tests of an individual
// ripper, or any non-build caller), createBrowserbaseFetch behaves exactly as
// before — no caching, every call hits Browserbase.

let activeCache: BrowserbaseCache | null = null;
let staleServeLog: StaleServe[] = [];

export function initBrowserbaseCache(cache: BrowserbaseCache): void {
  activeCache = cache;
  staleServeLog = [];
}

export function getBrowserbaseCache(): BrowserbaseCache | null {
  return activeCache;
}

/** Test/teardown helper — clears the injected cache and stale-serve log. */
export function resetBrowserbaseCache(): void {
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

/** A cache entry for `url` that is still fresh, or undefined. */
export function lookupFreshEntry(url: string, nowMs: number): BrowserbaseCacheEntry | undefined {
  if (!activeCache) return undefined;
  const entry = activeCache.entries[url];
  if (entry && isFresh(entry, nowMs)) return entry;
  return undefined;
}

/** Any cache entry for `url`, fresh or stale (used for failure fallback). */
export function lookupAnyEntry(url: string): BrowserbaseCacheEntry | undefined {
  return activeCache?.entries[url];
}

export function storeEntry(url: string, entry: BrowserbaseCacheEntry): void {
  if (activeCache) activeCache.entries[url] = entry;
}
