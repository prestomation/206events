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

/**
 * Creates a fetch function that routes requests through Browserbase's Fetch API.
 * Browserbase executes JavaScript and follows redirects, bypassing bot detection
 * (e.g. SiteGround sgcaptcha, NinjaFirewall).
 */
export function createBrowserbaseFetch(): FetchFn {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) {
        throw new Error("BROWSERBASE_API_KEY not set — required for browserbase proxy");
    }
    return async (url: string | URL, _init?: RequestInit) => {
        const response = await fetch("https://api.browserbase.com/v1/fetch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-BB-API-Key": apiKey,
            },
            body: JSON.stringify({
                url: String(url),
                allowRedirects: true,
            }),
        });
        if (!response.ok) {
            throw new Error(`Browserbase fetch failed: HTTP ${response.status}`);
        }
        const data = await response.json() as { statusCode: number; content: string; contentType: string };
        return new Response(data.content, {
            status: data.statusCode,
            headers: { "Content-Type": data.contentType },
        });
    };
}
