# 206.events Instagram Source

Read the posts of `type: instagram` calendar sources and record the events they
describe into `instagram-cache.json`, so the `instagram` ripper can publish them.

This is the Instagram analog of the `event-uncertainty-resolver` skill. The
ripper (`lib/config/instagram.ts`) never touches Instagram or an LLM — it is a
pure reader of the cache. **This skill is where the fetching and the vision
reading happen**, and it always runs **out of band** — never from the build:

- A human/agent runs `/instagram-source` locally (residential IP, which
  Instagram tolerates at low volume), or
- a scheduled **Claude routine** runs this same skill.

Either way it commits its `instagram-cache.json` updates back to the repo as a
PR; the build (and CI) only ever reads the committed cache. All the logic lives
here and in `scripts/instagram-cache.py` — no workflow fetches Instagram.

## Why a skill instead of a ripper-time fetch

Instagram's old public JSON endpoints (`?__a=1`) are dead (2026), the official
Graph API only exposes accounts you own, and GitHub Actions IPs are
rate-limited/blocked (429 after a couple of requests). The mobile web API
(`X-IG-App-ID` trick, see step 2) works from residential and many server IPs,
but not reliably from CI. On top of that, event details (date, time, venue) are
frequently baked into the **flyer image**, not the caption — so extraction needs
vision and judgment, not a parser. Doing it here keeps the build deterministic
and offline.

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

- **Mobile web API** (primary): `GET
  https://i.instagram.com/api/v1/users/web_profile_info/?username=<handle>`
  with headers `X-IG-App-ID: 936619743392459` and `Sec-Fetch-Site: same-origin`.
  Returns full profile + recent posts with captions, shortcodes, timestamps,
  and image URLs. Works from residential IPs and most server IPs without auth.
  Paginate with `?username=<handle>&after=<end_cursor>` using `end_cursor` from
  `page_info`. Rate-limits after ~5 rapid requests; pause 30s between calls.
  Verified returning HTTP 200 with full post data from a residential IP, a
  server IP, and the Claude Code web sandbox.
  ```bash
  curl -sS -H 'X-IG-App-ID: 936619743392459' -H 'Sec-Fetch-Site: same-origin' \
    'https://i.instagram.com/api/v1/users/web_profile_info/?username=<handle>'
  ```
  Posts live under `.data.user.edge_owner_to_timeline_media.edges[].node`
  (`shortcode`, `id`, `taken_at_timestamp`, `display_url`, and
  `edge_media_to_caption.edges[0].node.text`).
  **Carousels (`__typename: "GraphSidecar"`) have more than one image** —
  `display_url` is only the *first* slide. Pull **every** child image URL from
  `node.edge_sidecar_to_children.edges[].node.display_url` and read all of them
  (step 3), because a later slide often carries the date/time/venue that the
  first slide and the caption omit. A multi-event "this week" roundup is the
  classic case: the times sit on the flyer, not in the caption.
- **`WebFetch`** the profile or a post permalink (fallback — works from
  residential IP / out of band; returns a JS shell with only OG meta tags, no
  post data; will 429 from CI and the web sandbox).
- **A cookieless scraper API** (e.g. ScrapeCreators, Apify cookieless,
  ScrapingBot) when you have a key — reliable, ~cents per run for one account.
  Read the key from an env var; never hardcode it.
- **Instaloader** (`pip install instaloader`) — last resort; dead without login
  as of 2026 (anonymous GraphQL queries return empty). Only useful with a
  logged-in session, which is fragile and ToS-risky.

**Stories and highlights are NOT accessible** without an authenticated session
cookie — the `X-IG-App-ID` trick alone is insufficient. This is fine because
venues announce events as feed posts with flyer images, not stories.

Check what's already recorded so you only read new/changed posts:

```bash
python3 skills/instagram-source/scripts/instagram-cache.py list --username <username>
```

Skip a post if its id is already in the cache **and** its caption+image are
unchanged (same fingerprint). Re-read it if the post was edited.

### 3. Read each new post and classify it

For each new/changed post:

1. **Read the flyer image(s) — this step is mandatory, not optional.**
   Download and `Read` (vision) **every** image on the post — the `display_url`
   *and* all `edge_sidecar_to_children` slides for a carousel — and read them
   **before** you decide any field. The flyer is the **authoritative** source
   for start time and venue; the caption usually omits them (e.g. a caption that
   says only "join us for a dramatic afternoon on the 12th" while the flyer reads
   "3pm at Charlie's Queer Books"). **Never record an event from the caption
   alone** — if you haven't looked at the image, you have not read the post.
   Where a per-event ticketing page exists (Eventbrite, TicketSpice, etc.),
   cross-check it too; it's often the most precise, but it does **not** replace
   reading the flyer, and many posts have no such page.
2. Decide: **is this a real, dated event** in the Seattle area? Recaps, memes,
   "we're hiring", generic promos → **not an event**.
3. If it is an event, extract (reading the flyer for each, not just the caption):
   - `title` — the event name
   - `date` — `YYYY-MM-DD` (resolve relative dates like "this Friday" against
     the post timestamp)
   - `startTime` — local `HH:MM`. **Check the flyer specifically** — the time is
     almost always printed there even when the caption skips it. Omit only if
     it's genuinely absent from *both* the image and the caption — do **not**
     guess; the ripper will flag it and the uncertainty resolver can fill it.
   - `location` — the venue address as you'd want it in a calendar app (also
     usually on the flyer)
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

Write into the committed cache with **`--committed instagram-cache.json`** — this
is the file the build reads, and committing it puts every change under review in
the PR you open. (The script can also read/write an optional S3 store when run
without `--committed`, but the build reads the committed file.)

**On `--image-url`:** Instagram CDN URLs (`scontent-*.cdninstagram.com`) carry a
short `oe=` expiry (~2 weeks) and 404 afterward, so don't commit one as a
durable `imageUrl` — it'll become a broken image on the site. Omit it (the event
still publishes; it just counts as a non-fatal photo gap), or use the
photo-resolver flow to attach a stable image.

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
- **Cache (committed):** `instagram-cache.json` at the repo root — the file the build reads
- **Design doc:** `docs/instagram-source.md`
- **Sibling skill:** `skills/event-uncertainty-resolver/SKILL.md`
