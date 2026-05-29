# Browserbase Proxy Implementation Plan

## Problem

SiteGround-hosted ICS feeds (earshot-jazz, seattledances, shunpike, urban-league-seattle) and NinjaFirewall sites (populus-seattle) block GitHub Actions IPs. Previously we thought this was an IP-based block, but testing confirmed it's a **JavaScript challenge page** (sgcaptcha) that sets a cookie and redirects. Executing the JS in a real browser bypasses it.

## Solution: `proxy: browserbase`

Add a new proxy type that routes external ICS fetches through Browserbase's Fetch API, which executes JavaScript and bypasses bot detection. This replaces `proxy: outofband` for sources that only need JS execution (not a residential IP).

### Test Results (all passing ✅)

| Source | Status | Size | Notes |
|---|---|---|---|
| earshot-jazz | ✅ 200 | Full ICS | SiteGround |
| seattledances | ✅ 200 | 35KB | SiteGround |
| shunpike | ✅ 200 | 1.6KB | SiteGround |
| urban-league-seattle | ✅ 200 | 49KB | SiteGround, needs `allowRedirects: true` |
| seattle-dsa | ✅ 200 | 97KB | Works direct too, would be backup |
| populus-seattle | ✅ 200 | 14KB | NinjaFirewall |
| langston | ❌ | HTML | ICS feed genuinely broken on their end |

---

## Architecture Changes

### 1. Schema: Add `browserbase` proxy type

**File: `lib/config/schema.ts`**

```ts
// Change:
proxy: z.enum(["outofband"]).or(z.literal(false)).default(false),

// To:
proxy: z.enum(["outofband", "browserbase"]).or(z.literal(false)).default(false),
```

**File: `lib/config/proxy-fetch.ts`**

Add a new `BrowserbaseFetchFn` that calls the Browserbase Fetch API:

```ts
export type ProxyType = "outofband" | "browserbase" | false;

export function getFetchForConfig(config: { proxy?: ProxyType }): FetchFn {
    if (config.proxy === "browserbase") {
        return createBrowserbaseFetch();
    }
    // outofband and false → direct fetch
    return (url, init) => fetch(url, init);
}

function createBrowserbaseFetch(): FetchFn {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) {
        throw new Error("BROWSERBASE_API_KEY not set — required for browserbase proxy");
    }
    return async (url: string | URL, init?: RequestInit) => {
        const response = await fetch("https://api.browserbase.com/v1/fetch", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-BB-API-Key": apiKey,
            },
            body: JSON.stringify({
                url: String(url),
                allowRedirects: true,  // Required for urban-league 301 redirect
            }),
        });
        if (!response.ok) {
            throw new Error(`Browserbase fetch failed: HTTP ${response.status}`);
        }
        const data = await response.json();
        // Return a Response object that mimics a normal fetch response
        return new Response(data.content, {
            status: data.statusCode,
            headers: { "Content-Type": data.contentType },
        });
    };
}
```

### 2. External ICS: Apply `proxy: browserbase` to external calendars

**File: `sources/external.yaml`**

Add `proxy: browserbase` to the 4 SiteGround sources + populus-seattle:

```yaml
- name: earshot-jazz
  proxy: browserbase   # NEW
  ...

- name: seattledances
  proxy: browserbase   # NEW
  ...

- name: shunpike
  proxy: browserbase   # NEW
  ...

- name: urban-league-seattle
  proxy: browserbase   # NEW
  ...

- name: populus-seattle
  proxy: browserbase   # NEW
  ...
```

Also update `externalCalendarSchema` to accept `proxy`:

```ts
export const externalCalendarSchema = z.object({
    // ... existing fields ...
    proxy: z.enum(["outofband", "browserbase"]).or(z.literal(false)).default(false).optional(),
});
```

### 3. Main build: Use browserbase fetch for external calendars

**File: `lib/calendar_ripper.ts`**

In the external calendar fetch loop (~line 482), use the proxy-aware fetch:

```ts
// Before:
const response = await fetch(calendar.icsUrl);

// After:
const fetchFn = calendar.proxy === "browserbase"
    ? createBrowserbaseFetch()
    : (url: string | URL, init?: RequestInit) => fetch(url, init);
const response = await fetchFn(calendar.icsUrl);
```

### 4. GitHub Actions: Add BROWSERBASE_API_KEY secret

**File: `.github/workflows/publish_calendars.yml`**

Add the secret to the build environment:

```yaml
env:
  BROWSERBASE_API_KEY: ${{ secrets.BROWSERBASE_API_KEY }}
```

Also update the out-of-band workflow to remove the 5 SiteGround sources that are now handled by browserbase in the main build.

### 5. Out-of-band: Remove browserbase sources from out-of-band runner

The out-of-band runner (`scripts/generate-outofband.ts`) already filters by `proxy: "outofband"`. Sources marked `proxy: browserbase` will be excluded automatically since they're now handled in the main build.

### 6. Remove browserbase sources from `proxy: outofband`

**File: `sources/external.yaml`**

Remove the out-of-band proxy designation from sources that now use browserbase. These sources are now fetched in the main GitHub Actions build via Browserbase — no separate residential IP needed.

The out-of-band runner should only handle ripper-based sources (Neumos, Barboza, etc.) that need residential IP for their HTML scraping, not ICS feeds that just need JS execution.

---

## Cost Analysis

- Browserbase Fetch API: **Free tier = 1,000 credits/month**
- Our usage: ~5 sources × 1 build/day = ~150 fetches/month
- Well within free tier — **$0/month**

If we need more (retry logic, multiple builds/day):
- Pro plan: $29/month for 2,000 credits
- Still very affordable

---

## Migration from `proxy: outofband` to `proxy: browserbase`

The 5 SiteGround ICS sources were previously `proxy: outofband` (fetched from residential IP in a separate build). Now they'll use `proxy: browserbase` in the main build:

| Source | Before | After |
|---|---|---|
| earshot-jazz | outofband (residential IP) | browserbase (JS execution) |
| seattledances | outofband (residential IP) | browserbase (JS execution) |
| shunpike | outofband (residential IP) | browserbase (JS execution) |
| urban-league-seattle | outofband (residential IP) | browserbase (JS execution) |
| populus-seattle | outofband (residential IP) | browserbase (JS execution) |

The out-of-band runner retains its ripper-based sources (Neumos, Barboza, SAM, etc.) that actually need a residential IP for HTML scraping.

---

## Files to Change

1. **`lib/config/schema.ts`** — Add `browserbase` to proxy enum + external calendar schema
2. **`lib/config/proxy-fetch.ts`** — Add `createBrowserbaseFetch()` function
3. **`lib/config/proxy-fetch.test.ts`** — Add browserbase fetch tests
4. **`lib/calendar_ripper.ts`** — Use proxy-aware fetch for external calendars
5. **`sources/external.yaml`** — Add `proxy: browserbase` to 5 sources
6. **`.github/workflows/publish_calendars.yml`** — Add `BROWSERBASE_API_KEY` env var
7. **`scripts/generate-outofband.ts`** — No changes needed (filters by `outofband`)

## What Stays as `proxy: outofband`

These ripper-based sources need residential IP + full browser, not just JS execution:
- Neumos (AXS skin HTML scraping)
- Barboza (AXS skin HTML scraping)
- SAM (HTML scraping)
- Emerald City Comedy (HTML scraping)
- Rainier Arts Center (HTML scraping)
- Seattle Barkery (HTML scraping)
- Hellbent Brewing (HTML scraping)
- NW Metal Calendar (HTML scraping)

They stay on the out-of-band runner running on Preston's home server.

## Edge Cases

- **`allowRedirects: true`** — urban-league-seattle returns 301. Must follow redirects.
- **Browserbase 500 error** — langston returns 500 from Browserbase. The source is genuinely broken (returns HTML even with JS). Keep as `disabled: true`.
- **Missing API key** — If `BROWSERBASE_API_KEY` is not set, throw a clear error. Build should fail hard, not silently skip.
- **Rate limits** — Browserbase free tier allows concurrent requests. We fetch externals with bounded concurrency (`CONCURRENCY` = 5). Should be fine.