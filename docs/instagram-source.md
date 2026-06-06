# Instagram source type

Some Seattle events only exist as **Instagram posts** — a flyer image plus a
caption — with no website, ICS feed, or API behind them. The `instagram` ripper
type lets us cover such accounts. `headinthecloudstrivia` is the first example.

## Why it can't be a normal ripper

Two constraints make a build-time fetch impossible:

1. **Instagram is unfetchable from CI.** The old public JSON endpoints
   (`?__a=1`) are dead (2026), the official Graph API only exposes accounts you
   *own* (business/creator), and GitHub Actions IPs are rate-limited/blocked
   (429 after a couple of requests). Even the web sandbox 429s the profile.
2. **The data needs vision, not a parser.** Event date/time/venue are routinely
   baked into the flyer **image**, not the caption. Extracting them is LLM work,
   and — per the repo's core principle (`docs/event-uncertainty.md`) — it must
   be explicit about what it couldn't read rather than guessing.

So extraction is split from publishing.

## Architecture

```
  skill: skills/instagram-source/  ── reads posts + flyer images (vision),
   (out of band, OR fired from CI)    classifies, extracts fields
            │
            ▼  scripts/instagram-cache.py  write …
  instagram-cache.json   ── postId → { isEvent, title, date, startTime, … }
   (S3 live store + committed override, merged committed-wins at build time)
            │
            ▼
  lib/config/instagram.ts (InstagramRipper)  ── PURE READER, no network/LLM
   • one event per isEvent entry for the calendar's username
   • stable id = `<username>-<postId>`
   • missing field → event + UncertaintyError (reuses the uncertainEvents queue)
            │
            ▼  toICS / geocode / discovery (unchanged)
```

**Thin CI, fat skill.** The build (`InstagramRipper`) only reads
`instagram-cache.json` — it never calls Instagram or an LLM, so it stays
deterministic and offline. All the fetching and image reading lives in the
`instagram-source` skill and `instagram-cache.py`, which are runnable by an agent
locally *or* fired from CI as a one-line Claude routine
(`publish_calendars.yml` → `refresh-instagram`, gated on
`CLAUDE_INSTAGRAM_ROUTINE_ID`). The same code path serves both.

## The cache

`instagram-cache.json` (repo root) is an empty committed baseline; the live store
is S3 (`latest/instagram-cache.json` on the outofband bucket). Persistence
mirrors `event-uncertainty-cache.json` exactly: the build downloads S3 and merges
the committed file over it with **committed winning**, so a web session without
S3 write access can still seed manually-read posts by committing them.

Entry shape (see `lib/instagram-cache.ts` for the authoritative type), keyed by
`<username>:<postId>`:

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
- `instagram-cache.json` — committed empty baseline / override layer
- `skills/instagram-source/SKILL.md` + `scripts/instagram-cache.py` — the fat layer
- `.github/workflows/build-calendars.yml` — S3 download/upload + artifact
- `.github/workflows/publish_calendars.yml` — `refresh-instagram` fire job
