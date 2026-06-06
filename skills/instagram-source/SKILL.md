# 206.events Instagram Source

Read the posts of `type: instagram` calendar sources and record the events they
describe into `instagram-cache.json`, so the `instagram` ripper can publish them.

This is the Instagram analog of the `event-uncertainty-resolver` skill. The
ripper (`lib/config/instagram.ts`) never touches Instagram or an LLM — it is a
pure reader of the cache. **This skill is where the fetching and the vision
reading happen.** It is runnable two ways, with identical behavior:

- **Out of band** — a human/agent runs `/instagram-source` locally (residential
  IP, which Instagram tolerates at low volume).
- **From CI** — `publish_calendars.yml` fires a thin Claude routine that runs
  this same skill. All the logic lives here and in `scripts/instagram-cache.py`,
  so CI stays a one-line fire-and-forget.

## Why a skill instead of a ripper-time fetch

Instagram's public JSON endpoints are dead (2026), the official Graph API only
exposes accounts you own, and GitHub Actions IPs are rate-limited/blocked (429
after a couple of requests). On top of that, event details (date, time, venue)
are frequently baked into the **flyer image**, not the caption — so extraction
needs vision and judgment, not a parser. Doing it here keeps the build
deterministic and offline.

## Workflow

### 1. Enumerate Instagram sources

```bash
python3 skills/instagram-source/scripts/instagram-cache.py list-sources
```

Prints each `type: instagram` source with its `username` and disabled state.
For each source (skip ones you can't reach), do the steps below.

### 2. Fetch the account's recent posts

You need, per recent post: a **post id / shortcode** (from the permalink), the
**permalink**, the **caption**, the **image URL**, and the **post timestamp**.
Use whichever of these works from your current network; prefer the cheapest that
returns data:

- **`WebFetch`** the profile or a post permalink (works from a residential IP /
  out of band; will 429 from CI and the web sandbox).
- **A cookieless scraper API** (e.g. ScrapeCreators, Apify cookieless,
  ScrapingBot) when you have a key — most reliable, ~cents per run for one
  account. Read the key from an env var; never hardcode it.
- **Instaloader** (`pip install instaloader`) as a zero-cost local fallback —
  works without login but rate-limits hard, so fetch only the newest ~12 posts
  and add delays.

Check what's already recorded so you only read new/changed posts:

```bash
python3 skills/instagram-source/scripts/instagram-cache.py list --username <username>
```

Skip a post if its id is already in the cache **and** its caption+image are
unchanged (same fingerprint). Re-read it if the post was edited.

### 3. Read each new post and classify it

For each new/changed post:

1. **Read the flyer image** (`Read` the downloaded image — vision) **and** the
   caption together.
2. Decide: **is this a real, dated event** in the Seattle area? Recaps, memes,
   "we're hiring", generic promos → **not an event**.
3. If it is an event, extract:
   - `title` — the event name
   - `date` — `YYYY-MM-DD` (resolve relative dates like "this Friday" against
     the post timestamp)
   - `startTime` — local `HH:MM` (omit if genuinely not stated — do **not**
     guess; the ripper will flag it and the uncertainty resolver can fill it)
   - `location` — the venue address as you'd want it in a calendar app
   - optionally `durationSeconds`, `description`, `imageUrl`

**Never guess.** Omit a field you can't read; the ripper surfaces it as an
`UncertaintyError` in the normal `uncertainEvents` queue rather than publishing a
fabricated value. This is the same discipline as the geo- and uncertainty-resolvers.

### 4. Record the result

Compute a `--fingerprint` (a short hash of caption + image URL) so an edited post
is re-read later. Then:

```bash
# An event:
python3 skills/instagram-source/scripts/instagram-cache.py write \
  --username headinthecloudstrivia --post-id C8xZ1ab \
  --permalink 'https://www.instagram.com/p/C8xZ1ab/' \
  --title 'Trivia Night at Hopvine' --date 2026-06-12 --start-time 19:30 \
  --duration 7200 --location '507 15th Ave E, Seattle, WA 98112' \
  --image-url 'https://.../flyer.jpg' --fingerprint a1b2c3

# Not an event:
python3 skills/instagram-source/scripts/instagram-cache.py write \
  --username headinthecloudstrivia --post-id C8yQ2cd \
  --not-event --reason 'Recap photo of last week, no upcoming date'
```

By default the script reads/writes the cache in **S3** (the live store). In a
session without S3 access (e.g. a web session), pass `--committed
instagram-cache.json` to write into the committed override file instead — the
build merges committed entries over S3 with committed winning, exactly like
`event-uncertainty-cache.json`.

### 5. Enable a newly-seeded source

A `type: instagram` source ships `disabled: true` until its cache has at least
one real event (a new source with 0 events fails the build). Once you've recorded
real events for it, flip `disabled: true` → remove it (or `false`) in the
source's `ripper.yaml` **in the same PR** that adds the cache entries.

### 6. Prune

```bash
python3 skills/instagram-source/scripts/instagram-cache.py prune \
  --older-than 14 --orphan-usernames --dry-run     # review, then drop --dry-run
```

Drops past events and entries for usernames no longer configured.

### 7. Report

In your reply: posts read, events recorded, non-events skipped, fields left
unknown (these become `uncertainEvents`), and any source you enabled.

## ⚠️ Never read instagram-cache.json directly into context

It grows with every post. Use the script's `list` subcommand; never `cat` the
whole file.

## Adding another Instagram account

1. Add `sources/<slug>/ripper.yaml` with `type: instagram`, `disabled: true`,
   `geo` (a `{lat,lng}` for a single-venue account, else `null`), tags, and
   `config.username`. Name the source after the org, not the platform —
   `instagram` is an implementation detail already captured by `type`.
2. Run this skill to seed real events, then enable the source (step 5).

## Key references

- **Ripper:** `lib/config/instagram.ts` (pure cache reader)
- **Cache module:** `lib/instagram-cache.ts`
- **Cache (S3):** `calendar-ripper-outofband-220483515252/latest/instagram-cache.json`
- **Design doc:** `docs/instagram-source.md`
- **Sibling skill:** `skills/event-uncertainty-resolver/SKILL.md`
