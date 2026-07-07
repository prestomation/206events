# Privacy & Consent Posture

206.events runs **without a cookie-consent banner**, by design. This document
records *why* that's compliant and what the site is and isn't allowed to do so
it stays that way. The design rule that enforces this lives in `AGENTS.md`
("Privacy & Consent by Design"); this file is the rationale and the inventory.

## The legal frame (informal)

This is not legal advice, but it's the model the design follows:

- **GDPR / ePrivacy Directive (EU/UK), Art. 5(3)** governs *any* storing of, or
  access to, information on a visitor's device — **cookies, `localStorage`,
  `sessionStorage`, IndexedDB alike**. It is technology-neutral; using
  `localStorage` instead of a cookie does **not** dodge it.
- A **consent banner is required only for non-essential** storage/processing:
  analytics that tracks/profiles, advertising, fingerprinting, or disclosing
  visitor data to a third party that does those things.
- **Strictly-necessary** storage (auth/session, security) and **user-input /
  user-preference** storage are **exempt** — no banner needed.
- Separately, **disclosing a visitor's IP to a third-party origin** (e.g. a
  font CDN) is itself a data transfer that's drawn regulator attention (a German
  court fined a site over Google Fonts loaded from `fonts.googleapis.com` in
  2022). The fix is first-party hosting, not a banner.

The site stays entirely inside the exempt categories, so there is nothing for a
banner to ask consent for.

## Inventory: what the site does

| Mechanism | What / where | Classification | Banner? |
|---|---|---|---|
| `session` JWT cookie | `infra/favorites-worker/src/auth.ts` — set only when a user logs in | Strictly necessary (auth) | No |
| `oauth_nonce` cookie | `infra/favorites-worker/src/auth.ts` — CSRF nonce during OAuth | Strictly necessary (security) | No |
| Google OAuth login | `infra/favorites-worker/src/auth.ts` | Strictly necessary for a feature the user requested (login) | No |
| `localStorage` keys (favorites, search/geo filters, add-mode, map width, FTUX flag, UAT lists, debug-mode flag) | `web/src/App.jsx`, `web/src/redesign/App206.jsx` | Functional / user preferences | No |
| GoatCounter analytics | `web/vite.config.js`, `city.config.ts` | Cookieless, no fingerprinting, aggregate only | No |
| Core Web Vitals RUM | `web/src/lib/webVitals.js` — `web-vitals` library reporting LCP/INP/CLS/FCP/TTFB | Cookieless, **bucketed** (good/needs-improvement/poor), no raw timings, rides the existing GoatCounter channel | No |
| Fonts (Inter / Inter Tight / JetBrains Mono) | **Self-hosted** via `@fontsource`, bundled into the build — `web/src/index.css` | First-party; no third-party request | No |
| Map tiles | OpenStreetMap — `web/src/components/EventsMap.jsx` | First-party request to OSM, no tracking cookies | No |
| Map links (Google / OSM) | `web/src/lib/maplink.js` | User-initiated navigation, not an embed | No |
| Weather badges | Forecast fetched **at build time** from Open-Meteo by the CI runner (`lib/weather.ts`); the browser only reads the pre-baked `weather` field in `events-index.json` — no visitor request ever reaches a weather provider | Server-side only; zero visitor data disclosed | No |
| Advertising / marketing pixels | — | **None** | — |

## Why fonts are self-hosted

Previously the site loaded fonts from `fonts.googleapis.com`, which disclosed
every visitor's IP to Google on first paint — the one genuine third-party data
leak on the site. Fonts are now self-hosted with `@fontsource` packages: only
the **latin** subset and the **weights actually used** are imported, and Vite
bundles the woff2 files as first-party assets. No request leaves our origin for
typography. See the comment block at the top of `web/src/index.css`.

## Web Vitals RUM: bucketed, and on a separate plane from login

The site measures Core Web Vitals from real visitors (`web/src/lib/webVitals.js`)
to track performance over time — INP especially, the "typing feels slow" metric.
It stays consent-exempt because:

- **Cookieless and non-identifying.** `web-vitals` reads timings from the
  in-memory Performance API (no device storage, so Art. 5(3) isn't engaged) and
  reports only the **rating bucket** (`good` / `needs-improvement` / `poor`),
  never raw per-visitor numbers. Those buckets are the official CWV p75
  thresholds — aggregate by construction.
- **No new third party.** Beacons ride the **existing** GoatCounter channel as
  custom events (`vitals/<metric>/<rating>`), so no new origin receives visitor
  data.

**Two data planes, never joined.** The site has an authenticated plane (the
favorites-worker: `session` JWT, Google identity, per-user lists) and an
analytics plane (GoatCounter + Web Vitals). Login necessarily stitches the
*authenticated* plane — that's what login is, and its cookie is strictly
necessary/exempt. It does **not** stitch the analytics plane: a telemetry beacon
must never carry the logged-in identity (no user id, email, or `listId`) and must
never be routed through the authenticated worker, so a signed-in user's beacon is
byte-for-byte identical to an anonymous one. That separation is what keeps
"non-identifying" true even though the site supports accounts. **Do not** enrich a
beacon with identity for "segmentation" — that would join the planes and require a
banner.

> Percentiles (true p75 distributions, vs. buckets) would need a numeric sink
> because GoatCounter is count-only. That's a **technical** upgrade — a
> first-party, unauthenticated collector that stores `{metric, value, timestamp}`
> with no identity stays banner-free under the same rules. It is **not** in scope
> here, and it is **not** blocked by privacy; it's blocked by GoatCounter's
> count-only model.

## What would change the answer

Adding any of the following flips the site into "banner required" territory and
must be treated as a human-review decision (see `AGENTS.md`):

- A tracking cookie or any analytics tool that profiles individual users
  (Google Analytics, Meta Pixel, etc.).
- A third-party embed/CDN/script that sets cookies or fingerprints
  (YouTube/Maps iframes, social widgets, ad networks).
- Repurposing `localStorage`/`sessionStorage` for an advertising id or any
  value shared with a third party.
- Any advertising or marketing pixel.

If one of these is genuinely needed, design the consent mechanism (default-off,
granular opt-in) in the same change and update this document.
