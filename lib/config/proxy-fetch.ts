/**
 * Proxy-aware fetch utility.
 *
 * Proxy types:
 *   - "outofband": runs on a home server with a residential IP, uses direct fetch
 *   - "browserbase": routes through Browserbase's Fetch API for JS-challenge bypass
 *   - false: direct fetch (default)
 *
 * Usage in rippers:
 *   const fetchFn = getFetchForConfig(ripper.config);
 *   const res = await fetchFn(url, init);
 */

import {
    lookupFreshEntry,
    lookupAnyEntry,
    storeEntry,
    recordStaleServe,
} from "../browserbase-cache.js";

export type ProxyType = "outofband" | "browserbase" | false;

export type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Returns a fetch function appropriate for the ripper/calendar config.
 */
export function getFetchForConfig(config: { proxy?: ProxyType }): FetchFn {
    if (config.proxy === "browserbase") {
        return createBrowserbaseFetch();
    }
    // outofband and false → direct fetch
    return (url: string | URL, init?: RequestInit) => fetch(url, init);
}

/** Performs a single live Browserbase API fetch. Throws if the key is unset
 *  or the API call fails. */
async function browserbaseLiveFetch(
    urlStr: string,
): Promise<{ statusCode: number; content: string; contentType: string }> {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) {
        throw new Error("BROWSERBASE_API_KEY not set — required for browserbase proxy");
    }
    const response = await fetch("https://api.browserbase.com/v1/fetch", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-BB-API-Key": apiKey,
        },
        body: JSON.stringify({
            url: urlStr,
            allowRedirects: true,
        }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Browserbase fetch failed: HTTP ${response.status} — ${body.slice(0, 200)}`);
    }
    try {
        return await response.json() as { statusCode: number; content: string; contentType: string };
    } catch {
        throw new Error(`Browserbase API returned invalid JSON (HTTP ${response.status})`);
    }
}

/**
 * Creates a fetch function that routes requests through Browserbase's Fetch API.
 * Browserbase executes JavaScript and follows redirects, bypassing bot detection
 * (e.g. SiteGround sgcaptcha, NinjaFirewall).
 *
 * When a browserbase cache has been injected (initBrowserbaseCache), each URL
 * is fetched live at most once per TTL window (default 24h); fresh entries are
 * served from cache without an API call, and a live failure falls back to the
 * last good copy (recorded as a stale serve so the build report surfaces it).
 * With no cache injected, every call hits Browserbase live (legacy behavior).
 *
 * The API key is only required when a real fetch is performed, so a fully fresh
 * cache can be served even when BROWSERBASE_API_KEY is unset.
 */
export function createBrowserbaseFetch(): FetchFn {
    return async (url: string | URL, _init?: RequestInit) => {
        const urlStr = String(url);
        const nowMs = Date.now();

        // 1. Fresh cache hit — no network call.
        const fresh = lookupFreshEntry(urlStr, nowMs);
        if (fresh) {
            return new Response(fresh.content, {
                status: fresh.status,
                headers: { "Content-Type": fresh.contentType },
            });
        }

        // 2. Stale or missing — perform a real Browserbase fetch.
        try {
            const data = await browserbaseLiveFetch(urlStr);
            // Only cache successful responses so transient upstream error
            // pages don't poison the cache.
            if (data.statusCode >= 200 && data.statusCode < 300) {
                storeEntry(urlStr, {
                    fetchedAt: new Date(nowMs).toISOString(),
                    status: data.statusCode,
                    contentType: data.contentType,
                    content: data.content,
                });
            }
            return new Response(data.content, {
                status: data.statusCode,
                headers: { "Content-Type": data.contentType },
            });
        } catch (err) {
            // 3. Live fetch failed — fall back to the last good copy if we have
            //    one, recording a stale serve so the build report flags it.
            const stale = lookupAnyEntry(urlStr);
            if (stale) {
                const ageHours = Math.round((nowMs - Date.parse(stale.fetchedAt)) / 3_600_000);
                const message = err instanceof Error ? err.message : String(err);
                recordStaleServe({ url: urlStr, cachedAt: stale.fetchedAt, ageHours, error: message });
                console.warn(`[browserbase] live fetch failed for ${urlStr}; serving stale cache from ${stale.fetchedAt} (~${ageHours}h old): ${message}`);
                return new Response(stale.content, {
                    status: stale.status,
                    headers: { "Content-Type": stale.contentType },
                });
            }
            throw err;
        }
    };
}
