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
    DEFAULT_TTL_HOURS,
    MAX_ENTRY_AGE_DAYS,
    type FetchCacheEntry,
    type FetchCache,
} from "./fetch-cache.js";

function entry(fetchedAt: string): FetchCacheEntry {
    return { fetchedAt, status: 200, contentType: "text/calendar", content: "X" };
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
        // Pretty-printed for readable diffs, like the other caches.
        expect(await readFile(path, "utf-8")).toContain("\n  ");
    });
});

describe("isFresh / getCacheTtlMs", () => {
    afterEach(() => {
        delete process.env.FETCH_CACHE_TTL_HOURS;
    });

    it("defaults to a 24h TTL", () => {
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
