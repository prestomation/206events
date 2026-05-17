# 206.events Event Lookup

Search the **published production event data** for an event matching a
description. Returns top fuzzy candidates and a per-dimension score
breakdown so the caller (you, the agent) can decide whether anything is
actually a match.

## When to use

- "Is event X already in 206.events?"
- "Look up this event / poster / show / performance."
- The `source-from-event` skill calls this internally before deciding
  whether to add a new source.
- Whenever you need to know what 206.events currently covers, by event
  or by venue. **Searching `sources/` in the repo is the wrong answer**
  — many sources are aggregators (`seattle-showlists`, `19hz`,
  `ticketmaster`) that surface events for venues they don't appear to
  "own". The only authoritative answer is the published events index.

## Steps

### 1. Fetch live production data

```bash
bash skills/event-lookup/scripts/fetch-data.sh
```

Downloads three files to `/tmp/206events/` (refreshed if older than an
hour):

- `events-index.json` — every published event (~10k entries)
- `manifest.json` — all rippers + recurring + external feeds with
  tags and friendly names
- `venues.json` — geocoded venues

Use `--force` to bypass the freshness check.

### 2. Search

```bash
python3 skills/event-lookup/scripts/search-events.py \
    --title "<headliner or event name>" \
    --title "<another title from the poster>" \
    --venue "<venue or promoter name>" \
    --date 2026-06-12 \
    --url "https://example.com/event/123" \
    --org "<organizer or series>"
```

All arguments are optional; supply at least one. `--title` and `--org`
may be repeated — **always pass every plausible title string from the
poster** (headliner, openers, tour name, series name) as a separate
`--title`. The script takes the best score across all of them.

The output is JSON with four lanes:

| Lane | What it answers |
|---|---|
| `title_only_matches` (top 10) | "Is this event in the index, even if the venue/date don't match what I have?" Ranked by title score alone. Read this first. |
| `event_candidates` (top 30) | "What's the most likely overall match, considering title + venue + date + organizer?" Combined-score ranking. |
| `source_candidates` (top 8) | "Is the venue/promoter already covered by a ripper, recurring entry, or external feed?" — across all source kinds. |
| `venue_candidates` (top 8) | "Is this physical venue in `venues.json`?" |

Each event entry includes a `source.kind` (`ripper`, `recurring`, or
`external`) and `source.name` so you know which source covers it
without joining `manifest.json` yourself.

### 3. Decide what's actually a match

**The script does not decide.** It returns wide nets with scores. Your
job is to look at the top 5–10 candidates and the input together and
call it.

Guidelines:

- A score breakdown of `{title: 1.0, venue: 1.0, date: 1.0}` is very
  confident. Treat as a match.
- A high **title-only** score with mismatched venue/date is suspicious
  if the title is generic (`Trivia Night`, `Bingo`, `Open Mic`) and
  conclusive if the title is unique (a specific band name).
- A low combined score with the **right summary text** in
  `title_only_matches` is often still a match — the agent should
  recognise it where the score function couldn't (e.g. transliterated
  band names, vision misreads).
- Empty results mean nothing matched well enough to surface. Don't
  invent a match.

### 4. Report back

When invoked directly (not via `source-from-event`), reply with:

- Whether the event was found (and which `source.kind` / `source.name`
  covers it).
- If not found but the venue is covered, name the source and note that
  the event likely hasn't surfaced yet.
- If neither found, say so plainly.

## How the scoring works

| Dimension | Weight | Behavior |
|---|---|---|
| **Title** | 0.55 | Max across all `--title` queries, max across `ratio`/`jaccard`/`reverse_substring` against `summary` + `description` + URL slug. Reverse substring catches asymmetric overlaps ("Phoebe Bridgers Isolation Tour" ↔ "Phoebe Bridgers"). |
| **Venue** | 0.25 | Max across `--venue` queries against event `location`, the ripper's friendly name, and (if `--url` given) hostname match. |
| **Date** | 0.15 | 1.0 same day, linear decay to 0 at ±14 days, ignored if `--date` not given. |
| **Org/performer** | 0.05 | Substring + ratio over `summary` + `description` combined. Catches openers / promoter names that didn't make it into other fields. |

A separate **title-only** lane returns the top 10 events by raw title
score regardless of the combined score — so a poster with no readable
date or venue still surfaces strong title matches.

## Examples

```bash
# Known recurring event — should return 1.0 on every dimension
bash skills/event-lookup/scripts/fetch-data.sh
python3 skills/event-lookup/scripts/search-events.py \
    --title "Ballard Farmers Market" --venue "Ballard" --date 2026-05-17

# Vision-misread title — should still rank the real event in top 3
python3 skills/event-lookup/scripts/search-events.py \
    --title "Balard Farmer's Markt Sunday Edition"

# Venue coverage only — no title, just "is Neumos covered?"
python3 skills/event-lookup/scripts/search-events.py --venue "Neumos"
```

## Notes

- Stdlib-only (no `pip install`). Uses `difflib.SequenceMatcher` for
  fuzzy ratios.
- The cache lives in `$EVENT_LOOKUP_CACHE_DIR` (default
  `/tmp/206events`). Override to keep multiple agents from stomping on
  each other.
- The source site is `$EVENT_LOOKUP_SITE` (default `https://206.events`)
  for testing against a PR preview.
