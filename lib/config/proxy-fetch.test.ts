import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFetchForConfig, createBrowserbaseFetch } from "./proxy-fetch.js";

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

    it("throws when BROWSERBASE_API_KEY is not set", () => {
        delete process.env.BROWSERBASE_API_KEY;
        expect(() => createBrowserbaseFetch()).toThrow(
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
