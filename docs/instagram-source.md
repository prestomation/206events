# Instagram source type

Some Seattle events only exist as **Instagram posts** — a flyer image plus a
caption — with no website, ICS feed, or API behind them. The `instagram` ripper
type lets us cover such accounts. `headinthecloudstrivia` is the first example.

## Why it can't be a normal ripper

Two constraints make a build-time fetch impossible:

1. **Instagram is hard to fetch from CI.** The old public JSON endpoints
   (`?__a=1`) are dead (2026), the official Graph API only exposes accounts you
   *own* (business/creator), and GitHub Actions IPs are rate-limited/blocked
   (429 after a couple of requests). The mobile web API (`X-IG-App-ID` trick)
   works from residential and many server IPs but not reliably from CI.
   Stories and highlights require an authenticated session cookie and are not
   accessible anonymously.
2. **The data needs vision, not a parser.** Event date/time/venue are routinely
   baked into the flyer **image**, not the caption. Extracting them is LLM work,
   and — per the repo's core principle (`docs/event-uncertainty.md`) — it must
   be explicit about what it couldn't read rather than guessing.

So extraction is split from publishing.

## Fetching

The `instagram-source` skill fetches posts using the **mobile web API** as the
primary method:

```
GET https://i.instagram.com/api/v1/users/web_profile_info/?username=<handle>
Headers:
  X-IG-App-ID: 936619743392459
  Sec-Fetch-Site: same-origin
```

This returns the full profile and recent posts (captions, shortcodes,
timestamps, image URLs) without authentication. It works from residential IPs
and most server IPs. Rate-limits after ~5 rapid requests; pause between calls.
Paginate with `?username=<handle>&after=<end_cursor>`.

**What doesn't work (2026):**
- `?__a=1` endpoint — returns HTML JS shell, not JSON
- Instaloader (anonymous) — GraphQL queries return empty without login
- Stories/highlights — require authenticated session cookie

**What works as fallback:**
- WebFetch (residential IP only, OG meta tags only)
- Cookieless scraper APIs (ScrapeCreators, Apify, etc.)
- Instaloader with a logged-in session (fragile, ToS-risky)

## Architecture

```
  skill: skills/instagram-source/  ── reads posts + flyer images (vision),
   (out of band, or a Claude routine) classifies, extracts fields
            │
            ▼  scripts/instagram-cache.py  write … --committed
  instagram-cache.json   ── postId → { isEvent, title, date, startTime, … }
   (committed to the repo; updated via PR — the build reads it directly)
            │
            ▼
  lib/config/instagram.ts (InstagramRipper)  ── PURE READER, no network/LLM
   • one event per isEvent entry for the calendar's username
   • stable id = `<username>-<postId>`
   • missing field → event + UncertaintyError (reuses the uncertainEvents queue)
            │
            ▼  toICS / geocode / discovery (unchanged)
```

**Thin build, fat skill.** The build (`InstagramRipper`) only reads
`instagram-cache.json` — it never calls Instagram or an LLM, so it stays
deterministic and offline. All the fetching and image reading lives in the
`instagram-source` skill and `instagram-cache.py`. The skill is run **out of
band** — by a human/agent locally, or on a schedule by a **Claude routine** —
and commits its cache updates back to the repo as a PR. CI itself is untouched:
no workflow fetches Instagram, and the build simply reads the committed cache.

## The cache

`instagram-cache.json` (repo root) is committed to the repo and is the source of
truth the build reads directly. The `instagram-source` skill updates it (via
`instagram-cache.py write --committed`) and opens a PR, so every change to the
published events is reviewable in git. (`instagram-cache.py` still supports an
optional S3 store for setups that prefer it, but the default flow — and the one
the build reads — is the committed file.)

Entry shape (see `lib/instagram-cache.ts` for the authoritative type), keyed by
`<username>:<postId>`. `postId` is normally the real shortcode from the post's
permalink — but a multi-event roundup post (one flyer/carousel announcing
several distinct dated events, e.g. a "this month's events" graphic) can't be
represented as a single cache entry with one `date`. For each event on the
roundup that has no dedicated post of its own, use a synthetic id
`<realShortcode>-<slugify(title)>` (dashes, lowercase, derived from the
extracted title so it's reproducible if the post is re-read later) and record
the roundup post itself as `isEvent: false` with a `reason` cross-referencing
the synthetic ids it expanded into. An event that *does* get its own dedicated
post later should be re-recorded under that real shortcode instead, with the
synthetic entry pruned via `instagram-cache.py prune --orphan-usernames` or a
manual `del`.

A single post spanning **multiple consecutive dates with one identical
title** (e.g. a two-day festival: "Uwajimaya Summer Festival" on both July
18 and July 19) is a variant of the same problem — `slugify(title)` alone
would collide across the days. Suffix the slug with the date-scoped
disambiguator instead: `<realShortcode>-day-1`, `<realShortcode>-day-2`, etc.
(in chronological order). The roundup post's `isEvent: false` entry cross-
references all of them, same as any other expansion.

```json
{
  "isEvent": true,
  "title": "Trivia Night at Hopvine",
  "date": "2026-06-12",
  "startTime": "19:30",
  "durationSeconds": 7200,
  "location": "507 15th Ave E, Seattle, WA 98112",
  "imageUrl": "https://.../flyer.jpg",
  "permalink": "https://www.instagram.com/p/C8xZ1ab/",
  "postFingerprint": "a1b2c3",
  "readAt": "2026-06-05",
  "source": "agent"
}
```

`isEvent: false` entries (promos, recaps) are recorded so the post isn't re-read,
and the ripper skips them. A field the agent couldn't read is **omitted**, not
guessed; the ripper then emits the event plus an `UncertaintyError` so it shows
up in the existing `uncertainEvents` queue and the
`event-uncertainty-resolver`/this skill can fill it later. `postFingerprint`
(hash of caption + image) invalidates an entry when the post is edited.

## Reporting

No new build-error category. Events with an unread field reuse the existing
`UncertaintyError` → `uncertainEvents` surface, which is already plumbed through
every reporting channel. Non-events and unread posts simply aren't emitted.

## Adding an account

1. Add `sources/<slug>/ripper.yaml` (name the source after the org, not the
   platform — `instagram` is an implementation detail already captured by `type`):
   ```yaml
   name: <slug>
   type: instagram
   description: "<Account Name>"
   url: "https://www.instagram.com/<handle>/"
   friendlyLink: https://www.instagram.com/<handle>/
   disabled: true            # until the cache has real events (0-event sources fail the build)
   geo: null                 # or {lat,lng,label} for a single-venue account
   tags: ["..."]
   calendars:
     - name: <slug>
       friendlyname: "<Account Name>"
       timezone: America/Los_Angeles
       config:
         username: <handle>
         defaultDurationHours: 2     # optional
         defaultLocation: "..."      # optional fallback address
   ```
2. Run the `instagram-source` skill to seed real events, then flip
   `disabled: true` off in the same PR.

`geo` follows the usual rule: a single-venue account is a venue (`{lat,lng}`),
a mobile/multi-venue account (like a trivia host) is `geo: null` and is excluded
from `venues.json`.

## Files

- `lib/config/instagram.ts` — the ripper (pure cache reader)
- `lib/instagram-cache.ts` — cache types + load/save/lookup helpers
- `lib/config/instagram.test.ts` — unit tests (fixture cache → events/errors)
- `instagram-cache.json` — committed cache the build reads (seeded by the skill)
- `skills/instagram-source/SKILL.md` + `scripts/instagram-cache.py` — the fat layer
