import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFetchForConfig, createBrowserbaseFetch, withCache, type FetchFn } from "./proxy-fetch.js";
import {
    initFetchCache,
    resetFetchCache,
    getFetchCache,
    drainStaleServes,
    emptyFetchCache,
    type FetchCache,
} from "../fetch-cache.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function fakeResponse(body: string, status = 200): Response {
    return new Response(body, { status });
}

describe("getFetchForConfig", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("returns a direct fetch function when proxy is false", async () => {
        const fetchFn = getFetchForConfig({ proxy: false });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it("returns a direct fetch function when proxy is undefined", async () => {
        const fetchFn = getFetchForConfig({});
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it('returns direct fetch for "outofband" proxy', async () => {
        const fetchFn = getFetchForConfig({ proxy: "outofband" });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it('returns browserbase fetch for "browserbase" proxy', async () => {
        process.env.BROWSERBASE_API_KEY = "test-key";
        const fetchFn = getFetchForConfig({ proxy: "browserbase" });

        mockFetch.mockResolvedValueOnce(fakeResponse(JSON.stringify({
            statusCode: 200,
            content: "BEGIN:VCALENDAR\nEND:VCALENDAR",
            contentType: "text/calendar",
        })));

        const response = await fetchFn("https://example.com/cal.ics");

        expect(mockFetch).toHaveBeenCalledWith("https://api.browserbase.com/v1/fetch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-BB-API-Key": "test-key",
            },
            body: JSON.stringify({
                url: "https://example.com/cal.ics",
                allowRedirects: true,
            }),
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
        expect(response.headers.get("Content-Type")).toBe("text/calendar");

        delete process.env.BROWSERBASE_API_KEY;
    });
});

describe("createBrowserbaseFetch", () => {
    const originalEnv = process.env.BROWSERBASE_API_KEY;

    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.BROWSERBASE_API_KEY = originalEnv;
        } else {
            delete process.env.BROWSERBASE_API_KEY;
        }
    });

    it("throws when BROWSERBASE_API_KEY is not set and a live fetch is needed", async () => {
        // The key is only required when a real fetch happens (a fresh cache can
        // be served without it), so creation succeeds and the error surfaces on
        // the first uncached call.
        delete process.env.BROWSERBASE_API_KEY;
        const fetchFn = createBrowserbaseFetch();
        await expect(fetchFn("https://example.com/")).rejects.toThrow(
            "BROWSERBASE_API_KEY not set — required for browserbase proxy"
        );
    });

    it("sends correct request to Browserbase API", async () => {
        process.env.BROWSERBASE_API_KEY = "my-api-key";
        const fetchFn = createBrowserbaseFetch();

        mockFetch.mockResolvedValueOnce(fakeResponse(JSON.stringify({
            statusCode: 200,
            content: "<html>hello</html>",
            contentType: "text/html",
        })));

        await fetchFn("https://example.com/page");

        expect(mockFetch).toHaveBeenCalledWith("https://api.browserbase.com/v1/fetch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-BB-API-Key": "my-api-key",
            },
            body: JSON.stringify({
                url: "https://example.com/page",
                allowRedirects: true,
            }),
        });
    });

    it("throws on non-OK response from Browserbase API", async () => {
        process.env.BROWSERBASE_API_KEY = "my-api-key";
        const fetchFn = createBrowserbaseFetch();

        mockFetch.mockResolvedValueOnce(fakeResponse("error: unauthorized", 401));

        await expect(fetchFn("https://example.com/")).rejects.toThrow(
            "Browserbase fetch failed: HTTP 401 — error: unauthorized"
        );
    });

    it("includes response body in error message for debugging", async () => {
        process.env.BROWSERBASE_API_KEY = "my-api-key";
        const fetchFn = createBrowserbaseFetch();

        mockFetch.mockResolvedValueOnce(fakeResponse("some long error message that should be truncated because it exceeds two hundred characters".repeat(3), 500));

        await expect(fetchFn("https://example.com/")).rejects.toThrow(
            "Browserbase fetch failed: HTTP 500 — some long error message that should be truncated because it exceeds two hundred characterssome long error message that should be truncated because it exceeds"
        );
    });

    it("throws on malformed JSON response from Browserbase API", async () => {
        process.env.BROWSERBASE_API_KEY = "my-api-key";
        const fetchFn = createBrowserbaseFetch();

        mockFetch.mockResolvedValueOnce(fakeResponse("not json at all", 200));

        await expect(fetchFn("https://example.com/")).rejects.toThrow(
            "Browserbase API returned invalid JSON (HTTP 200)"
        );
    });

    it("converts URL object to string", async () => {
        process.env.BROWSERBASE_API_KEY = "my-api-key";
        const fetchFn = createBrowserbaseFetch();

        mockFetch.mockResolvedValueOnce(fakeResponse(JSON.stringify({
            statusCode: 200,
            content: "ok",
            contentType: "text/plain",
        })));

        await fetchFn(new URL("https://example.com/path"));

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.url).toBe("https://example.com/path");
    });
});

describe("createBrowserbaseFetch with an injected cache", () => {
    const URL = "https://example.com/cal.ics";

    function liveResponse(content: string, statusCode = 200, contentType = "text/calendar") {
        return fakeResponse(JSON.stringify({ statusCode, content, contentType }));
    }

    beforeEach(() => {
        vi.resetAllMocks();
        process.env.BROWSERBASE_API_KEY = "test-key";
    });

    afterEach(() => {
        resetFetchCache();
        delete process.env.BROWSERBASE_API_KEY;
        delete process.env.FETCH_CACHE_TTL_HOURS;
    });

    it("serves a fresh cache entry without any network call", async () => {
        const cache: FetchCache = {
            version: 1,
            entries: {
                [URL]: {
                    fetchedAt: new Date().toISOString(),
                    status: 200,
                    contentType: "text/calendar",
                    content: "CACHED-ICS",
                },
            },
        };
        initFetchCache(cache);

        const fetchFn = createBrowserbaseFetch();
        const res = await fetchFn(URL);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(await res.text()).toBe("CACHED-ICS");
        // A fresh hit never needs the key, so it works even when unset.
    });

    it("fetches live and stores the entry on a cache miss", async () => {
        const cache = emptyFetchCache();
        initFetchCache(cache);
        mockFetch.mockResolvedValueOnce(liveResponse("LIVE-ICS"));

        const fetchFn = createBrowserbaseFetch();
        const res = await fetchFn(URL);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(await res.text()).toBe("LIVE-ICS");
        const stored = getFetchCache()!.entries[URL];
        expect(stored.content).toBe("LIVE-ICS");
        expect(stored.status).toBe(200);
    });

    it("refetches a stale entry (TTL elapsed)", async () => {
        process.env.FETCH_CACHE_TTL_HOURS = "24";
        const cache: FetchCache = {
            version: 1,
            entries: {
                [URL]: {
                    fetchedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
                    status: 200,
                    contentType: "text/calendar",
                    content: "OLD-ICS",
                },
            },
        };
        initFetchCache(cache);
        mockFetch.mockResolvedValueOnce(liveResponse("NEW-ICS"));

        const fetchFn = createBrowserbaseFetch();
        const res = await fetchFn(URL);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(await res.text()).toBe("NEW-ICS");
        expect(getFetchCache()!.entries[URL].content).toBe("NEW-ICS");
    });

    it("does not cache non-2xx responses", async () => {
        const cache = emptyFetchCache();
        initFetchCache(cache);
        mockFetch.mockResolvedValueOnce(liveResponse("Not Found", 404));

        const fetchFn = createBrowserbaseFetch();
        const res = await fetchFn(URL);

        expect(res.status).toBe(404);
        expect(getFetchCache()!.entries[URL]).toBeUndefined();
    });

    it("falls back to a stale copy and records a stale serve when the live fetch fails", async () => {
        const cachedAt = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
        const cache: FetchCache = {
            version: 1,
            entries: {
                [URL]: {
                    fetchedAt: cachedAt,
                    status: 200,
                    contentType: "text/calendar",
                    content: "STALE-ICS",
                },
            },
        };
        process.env.FETCH_CACHE_TTL_HOURS = "24";
        initFetchCache(cache);
        mockFetch.mockResolvedValueOnce(fakeResponse("unauthorized", 401));

        const fetchFn = createBrowserbaseFetch();
        const res = await fetchFn(URL);

        expect(await res.text()).toBe("STALE-ICS");
        const stale = drainStaleServes();
        expect(stale).toHaveLength(1);
        expect(stale[0].url).toBe(URL);
        expect(stale[0].cachedAt).toBe(cachedAt);
        expect(stale[0].ageHours).toBe(30);
    });

    it("rethrows when the live fetch fails and there is no cached copy", async () => {
        initFetchCache(emptyFetchCache());
        mockFetch.mockResolvedValueOnce(fakeResponse("unauthorized", 401));

        const fetchFn = createBrowserbaseFetch();
        await expect(fetchFn(URL)).rejects.toThrow("Browserbase fetch failed: HTTP 401");
        expect(drainStaleServes()).toHaveLength(0);
    });
});

describe("withCache (generic, over an arbitrary fetch fn)", () => {
    const URL = "https://example.com/page";

    afterEach(() => {
        resetFetchCache();
        delete process.env.FETCH_CACHE_TTL_HOURS;
    });

    it("serves a fresh entry without calling the underlying fetch", async () => {
        initFetchCache({
            version: 1,
            entries: {
                [URL]: { fetchedAt: new Date().toISOString(), status: 200, contentType: "text/html", content: "CACHED" },
            },
        });
        const live: FetchFn = vi.fn();
        const fetchFn = withCache(live);

        const res = await fetchFn(URL);

        expect(live).not.toHaveBeenCalled();
        expect(await res.text()).toBe("CACHED");
    });

    it("calls the underlying fetch on a miss and stores the 2xx body", async () => {
        initFetchCache(emptyFetchCache());
        const live: FetchFn = vi.fn(async () =>
            new Response("LIVE", { status: 200, headers: { "Content-Type": "text/html" } }));
        const fetchFn = withCache(live);

        const res = await fetchFn(URL);

        expect(live).toHaveBeenCalledTimes(1);
        expect(await res.text()).toBe("LIVE");
        expect(getFetchCache()!.entries[URL].content).toBe("LIVE");
    });

    it("does not cache non-2xx responses", async () => {
        initFetchCache(emptyFetchCache());
        const live: FetchFn = vi.fn(async () => new Response("nope", { status: 404 }));
        const fetchFn = withCache(live);

        const res = await fetchFn(URL);

        expect(res.status).toBe(404);
        expect(getFetchCache()!.entries[URL]).toBeUndefined();
    });

    it("falls back to a stale copy and records a stale serve when the live fetch throws", async () => {
        const cachedAt = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
        process.env.FETCH_CACHE_TTL_HOURS = "24";
        initFetchCache({
            version: 1,
            entries: {
                [URL]: { fetchedAt: cachedAt, status: 200, contentType: "text/html", content: "STALE" },
            },
        });
        const live: FetchFn = vi.fn(async () => { throw new Error("boom"); });
        const fetchFn = withCache(live);

        const res = await fetchFn(URL);

        expect(await res.text()).toBe("STALE");
        const stale = drainStaleServes();
        expect(stale).toHaveLength(1);
        expect(stale[0].url).toBe(URL);
        expect(stale[0].error).toBe("boom");
    });

    it("keys POST requests by method + body so different bodies are distinct", async () => {
        initFetchCache({
            version: 1,
            entries: {
                [URL]: { fetchedAt: new Date().toISOString(), status: 200, contentType: "x", content: "WRONG" },
            },
        });
        const live: FetchFn = vi.fn(async () => new Response("POSTED", { status: 200 }));
        const fetchFn = withCache(live);

        // A POST with a body is a cache miss (not keyed by bare URL), so it hits live.
        const res = await fetchFn(URL, { method: "POST", body: '{"q":1}' });
        expect(live).toHaveBeenCalledTimes(1);
        expect(await res.text()).toBe("POSTED");
    });
});
