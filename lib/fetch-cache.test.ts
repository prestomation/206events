import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
    loadFetchCache,
    saveFetchCache,
    isFresh,
    getCacheTtlMs,
    emptyFetchCache,
    keyFor,
    pruneCache,
    selectOldestEntriesForRefresh,
    setProactiveRefreshKeys,
    initFetchCache,
    resetFetchCache,
    lookupFreshEntry,
    getFetchCacheStats,
    DEFAULT_TTL_HOURS,
    MAX_ENTRY_AGE_DAYS,
    type FetchCacheEntry,
    type FetchCache,
} from "./fetch-cache.js";

function entry(fetchedAt: string): FetchCacheEntry {
    return { fetchedAt, status: 200, contentType: "text/calendar", content: "X" };
}

// Build a cache whose entries are aged `hoursAgo[i]` hours before `now`.
function cacheAged(hoursAgo: number[], now = Date.now()): FetchCache {
    const entries: Record<string, FetchCacheEntry> = {};
    hoursAgo.forEach((h, i) => {
        entries[`url${i}`] = entry(new Date(now - h * 3600 * 1000).toISOString());
    });
    return { version: 1, entries };
}

describe("fetch-cache load/save", () => {
    const dirs: string[] = [];
    afterEach(async () => {
        for (const d of dirs) await rm(d, { recursive: true, force: true });
        dirs.length = 0;
    });

    async function tmpFile(name = "fetch-cache.json"): Promise<string> {
        const dir = await mkdtemp(join(tmpdir(), "fetchcache-"));
        dirs.push(dir);
        return join(dir, name);
    }

    it("returns an empty cache when the file is missing", async () => {
        const path = await tmpFile("does-not-exist.json");
        expect(await loadFetchCache(path)).toEqual(emptyFetchCache());
    });

    it("returns an empty cache on corrupt JSON", async () => {
        const path = await tmpFile();
        await writeFile(path, "{ not valid json");
        expect(await loadFetchCache(path)).toEqual(emptyFetchCache());
    });

    it("returns an empty cache on an unexpected shape", async () => {
        const path = await tmpFile();
        await writeFile(path, JSON.stringify({ foo: "bar" }));
        expect(await loadFetchCache(path)).toEqual(emptyFetchCache());
    });

    it("round-trips a populated cache", async () => {
        const path = await tmpFile();
        const cache = {
            version: 1,
            entries: { "https://example.com/cal.ics": entry("2026-06-05T00:00:00.000Z") },
        };
        await saveFetchCache(cache, path);
        expect(await loadFetchCache(path)).toEqual(cache);
        // Compact output (no indentation) to avoid RangeError on large caches.
        expect(await readFile(path, "utf-8")).not.toContain("\n  ");
    });
});

describe("isFresh / getCacheTtlMs", () => {
    afterEach(() => {
        delete process.env.FETCH_CACHE_TTL_HOURS;
    });

    it("defaults to the DEFAULT_TTL_HOURS window", () => {
        expect(getCacheTtlMs()).toBe(DEFAULT_TTL_HOURS * 3600 * 1000);
    });

    it("honors FETCH_CACHE_TTL_HOURS", () => {
        process.env.FETCH_CACHE_TTL_HOURS = "1";
        expect(getCacheTtlMs()).toBe(3600 * 1000);
    });

    it("treats an entry just under the TTL as fresh and just over as stale", () => {
        const now = Date.parse("2026-06-05T12:00:00.000Z");
        const ttl = 24 * 3600 * 1000;
        const fresh = entry(new Date(now - 23 * 3600 * 1000).toISOString());
        const stale = entry(new Date(now - 25 * 3600 * 1000).toISOString());
        expect(isFresh(fresh, now, ttl)).toBe(true);
        expect(isFresh(stale, now, ttl)).toBe(false);
    });

    it("treats an unparseable fetchedAt as stale", () => {
        expect(isFresh(entry("not-a-date"), Date.now())).toBe(false);
    });

    it("with TTL=0 every entry is stale", () => {
        process.env.FETCH_CACHE_TTL_HOURS = "0";
        expect(isFresh(entry(new Date().toISOString()), Date.now())).toBe(false);
    });
});

describe("keyFor", () => {
    it("uses the bare URL for a plain GET (back-compatible URL keys)", () => {
        expect(keyFor("https://example.com/cal.ics")).toBe("https://example.com/cal.ics");
        expect(keyFor("https://example.com/cal.ics", { method: "GET" })).toBe("https://example.com/cal.ics");
        expect(keyFor(new URL("https://example.com/cal.ics"))).toBe("https://example.com/cal.ics");
    });

    it("includes the method and a body hash for requests with a body", () => {
        const a = keyFor("https://api.example.com/graphql", { method: "POST", body: '{"q":"a"}' });
        const b = keyFor("https://api.example.com/graphql", { method: "POST", body: '{"q":"b"}' });
        // Distinct bodies → distinct keys; same body → same key.
        expect(a).not.toBe(b);
        expect(a).toBe(keyFor("https://api.example.com/graphql", { method: "POST", body: '{"q":"a"}' }));
        expect(a.startsWith("POST https://api.example.com/graphql\n")).toBe(true);
    });

    it("does not let auth headers affect the key", () => {
        const k1 = keyFor("https://api.example.com/events", { headers: { Authorization: "Bearer x" } });
        const k2 = keyFor("https://api.example.com/events", { headers: { Authorization: "Bearer y" } });
        expect(k1).toBe(k2);
        expect(k1).toBe("https://api.example.com/events");
    });
});

describe("pruneCache", () => {
    it("drops entries older than the max age and keeps fresh ones", () => {
        const now = Date.now();
        const cache: FetchCache = {
            version: 1,
            entries: {
                fresh: entry(new Date(now - 1 * 24 * 3600 * 1000).toISOString()),
                old: entry(new Date(now - (MAX_ENTRY_AGE_DAYS + 5) * 24 * 3600 * 1000).toISOString()),
                bogus: entry("not-a-date"),
            },
        };
        const removed = pruneCache(cache, now);
        expect(removed).toBe(2);
        expect(Object.keys(cache.entries)).toEqual(["fresh"]);
    });
});

describe("DEFAULT_TTL_HOURS", () => {
    it("is a 7-day cap (raised from 24h)", () => {
        expect(DEFAULT_TTL_HOURS).toBe(24 * 7);
    });
});

describe("selectOldestEntriesForRefresh", () => {
    it("returns the oldest `fraction` of keys (by fetchedAt), rounding up", () => {
        // ages: url0=1h, url1=10h, url2=50h, url3=100h (url3 oldest)
        const cache = cacheAged([1, 10, 50, 100]);
        // 0.5 of 4 → 2 oldest = url3 (100h) + url2 (50h)
        const half = selectOldestEntriesForRefresh(cache, 0.5);
        expect(half).toEqual(new Set(["url3", "url2"]));
        // 0.2 of 4 → ceil(0.8) = 1 oldest = url3
        const fifth = selectOldestEntriesForRefresh(cache, 0.2);
        expect(fifth).toEqual(new Set(["url3"]));
    });

    it("returns empty for fraction 0 and an empty cache; all keys for fraction 1", () => {
        const cache = cacheAged([1, 2, 3]);
        expect(selectOldestEntriesForRefresh(cache, 0)).toEqual(new Set());
        expect(selectOldestEntriesForRefresh(emptyFetchCache(), 0.5)).toEqual(new Set());
        expect(selectOldestEntriesForRefresh(cache, 1)).toEqual(new Set(["url0", "url1", "url2"]));
    });

    it("clamps out-of-range fractions and treats unparseable dates as oldest", () => {
        const cache = cacheAged([5, 10]);
        cache.entries["bad"] = entry("not-a-date");
        // fraction > 1 clamps to 1 → all three
        expect(selectOldestEntriesForRefresh(cache, 2)).toEqual(new Set(["url0", "url1", "bad"]));
        // negative clamps to 0
        expect(selectOldestEntriesForRefresh(cache, -1)).toEqual(new Set());
        // unparseable sorts oldest; ceil(3 * 0.34) = 2 → the two oldest = "bad" + url1 (10h)
        expect(selectOldestEntriesForRefresh(cache, 0.34)).toEqual(new Set(["bad", "url1"]));
        // ceil(3 * 0.2) = 1 → just the oldest ("bad")
        expect(selectOldestEntriesForRefresh(cache, 0.2)).toEqual(new Set(["bad"]));
    });
});

describe("proactive refresh forces a cache miss", () => {
    afterEach(() => resetFetchCache());

    it("lookupFreshEntry returns undefined for a selected key even when fresh", () => {
        const cache = cacheAged([1, 1]); // both fresh
        initFetchCache(cache);
        const now = Date.now();
        // Both fresh before selection.
        expect(lookupFreshEntry("url0", now)).toBeDefined();
        expect(lookupFreshEntry("url1", now)).toBeDefined();

        setProactiveRefreshKeys(new Set(["url0"]));
        expect(lookupFreshEntry("url0", now)).toBeUndefined(); // forced miss → re-fetch
        expect(lookupFreshEntry("url1", now)).toBeDefined();   // untouched
    });

    it("initFetchCache clears any prior proactive-refresh selection", () => {
        const cache = cacheAged([1]);
        initFetchCache(cache);
        setProactiveRefreshKeys(new Set(["url0"]));
        expect(lookupFreshEntry("url0", Date.now())).toBeUndefined();
        // Re-init (new build) clears the selection.
        initFetchCache(cache);
        expect(lookupFreshEntry("url0", Date.now())).toBeDefined();
    });
});

describe("proactive-refresh telemetry (cacheSize / forcedRefresh / forcedRefreshApplied)", () => {
    afterEach(() => resetFetchCache());

    it("records cacheSize on init and forcedRefresh on selection", () => {
        const cache = cacheAged([1, 2, 3, 4, 5]); // 5 entries
        initFetchCache(cache);
        expect(getFetchCacheStats().cacheSize).toBe(5);
        expect(getFetchCacheStats().forcedRefresh).toBe(0);

        const keys = selectOldestEntriesForRefresh(cache, 0.4); // ceil(5*0.4)=2
        setProactiveRefreshKeys(keys);
        expect(getFetchCacheStats().forcedRefresh).toBe(2);
    });

    it("counts forcedRefreshApplied only for selected keys that are actually requested", () => {
        const cache = cacheAged([1, 2, 3, 4]); // url0..url3, url3 oldest
        initFetchCache(cache);
        // Select the oldest two (url3, url2) but only request one of them plus a
        // non-selected one — applied should count just the requested selected key.
        setProactiveRefreshKeys(new Set(["url3", "url2"]));
        const now = Date.now();
        expect(lookupFreshEntry("url3", now)).toBeUndefined(); // selected + requested → applied++
        expect(lookupFreshEntry("url0", now)).toBeDefined();   // not selected → served
        expect(getFetchCacheStats().forcedRefresh).toBe(2);
        expect(getFetchCacheStats().forcedRefreshApplied).toBe(1); // url2 never requested
    });

    it("force-refreshes a selected key once; a re-request serves the refreshed copy and isn't re-counted", () => {
        const cache = cacheAged([1, 2]); // both within TTL
        initFetchCache(cache);
        setProactiveRefreshKeys(new Set(["url1"]));
        const now = Date.now();
        expect(lookupFreshEntry("url1", now)).toBeUndefined(); // forced miss → applied++
        expect(lookupFreshEntry("url1", now)).toBeDefined();   // dropped from set → served fresh
        expect(getFetchCacheStats().forcedRefreshApplied).toBe(1); // not double-counted
        expect(getFetchCacheStats().forcedRefreshApplied).toBeLessThanOrEqual(getFetchCacheStats().forcedRefresh);
    });

    it("resets telemetry on initFetchCache", () => {
        const cache = cacheAged([1, 1]);
        initFetchCache(cache);
        setProactiveRefreshKeys(new Set(["url0"]));
        lookupFreshEntry("url0", Date.now());
        expect(getFetchCacheStats().forcedRefreshApplied).toBe(1);

        initFetchCache(cacheAged([1, 2, 3]));
        const s = getFetchCacheStats();
        expect(s.forcedRefresh).toBe(0);
        expect(s.forcedRefreshApplied).toBe(0);
        expect(s.cacheSize).toBe(3);
    });
});
