---
name: photo-resolver
description: Backfill missing event and venue photos in 206.events. Reads the photoGaps work queue from build-errors.json and, in bounded batches, fills venue photos via source-YAML PRs and event photos via the event-uncertainty-cache (imageUrl), or marks them unresolvable when no photo exists.
---

# 206.events Photo Resolver

Backfill photos for events and venues that don't have one. The data model
stores **image URLs only** (never image bytes), in the `imageUrl` field.

There are two kinds of gap, fixed two different ways:

| Gap | Where it lives | How to fix |
|---|---|---|
| **Venue** photo | `imageUrl:` in the source YAML (ripper / external / recurring) | Open a PR adding `imageUrl:` (like geo-resolver edits venue coords) |
| **Event** photo | `event-uncertainty-cache.json` keyed `source:eventId` | Write an `imageUrl` resolution via `uncertainty-cache.py resolve --image-url` (committed file) |

Both are **non-fatal** todo queues, like geo and event-uncertainty. The queue
self-limits over time: once a photo is found (or confirmed unavailable and
marked `unresolvable`), the item drops off.

## Workflow

### 1. Check the queue and baseline coverage

```bash
python3 skills/photo-resolver/scripts/photo-gaps.py stats
```

Note the coverage % — this is your **baseline to beat**. Then list the gaps:

```bash
python3 skills/photo-resolver/scripts/photo-gaps.py venues --limit 25
python3 skills/photo-resolver/scripts/photo-gaps.py events --limit 25
```

(Pass `--url output/build-errors.json` to inspect a local build, or
`--url https://206.events/preview/<PR>/build-errors.json` for a PR preview.)

### 2. Process a bounded batch

**Do not try to drain the whole queue in one run.** Pick a batch — e.g. the
first **25** items — and resolve those. The queue is drained across many runs,
exactly like the geo and uncertainty backlogs. Prefer venues first (one PR
covers many future events at that venue) and high-traffic sources.

### 3a. Resolve a VENUE photo (source YAML → PR)

1. Find a representative, stable photo URL for the venue (the venue's own site,
   an official social profile image, or a Wikimedia/again-stable host). Prefer
   a direct `https://…/image.jpg` URL. **Link only — never download bytes.**
2. Add `imageUrl: "<url>"` to the source's YAML next to its `geo:` block:
   - ripper: `sources/<name>/ripper.yaml` (ripper-level, or per-calendar for a
     multi-branch source)
   - external: `sources/external/<name>.yaml`
   - recurring: `sources/recurring/<name>.yaml`
3. Open a PR (these are content changes — auto-merge-eligible per AGENTS.md).

### 3b. Resolve an EVENT photo (uncertainty cache)

For each event gap, fetch the source page (`url` from the queue), find a
representative image link, and write it into the cache:

```bash
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
  --key "<source>:<eventId>" --image-url "https://example.com/event.jpg" \
  --evidence "<source page url>"
```

If the source genuinely has **no** image, mark it unresolvable so it drops off
the queue and isn't re-investigated:

```bash
python3 skills/event-uncertainty-resolver/scripts/uncertainty-cache.py resolve \
  --key "<source>:<eventId>" --unresolvable --reason "no image on source page"
```

The build's `applyImageBackfill` pass applies these `imageUrl` resolutions on
the next build (see `docs/event-uncertainty.md` and `docs/photos.md`).

### 4. Re-trigger the build and report

After venue PRs merge / event resolutions are written, re-trigger the build so
the changes take effect, then re-check coverage:

```bash
python3 skills/photo-resolver/scripts/photo-gaps.py stats
```

Summarize:
- Photo coverage (events + venues) before vs after
- How many venue PRs opened, how many event resolutions written
- How many marked unresolvable
- Remaining gap count

## Notes

- **Links only.** Never base64/inline image data into the cache, YAML, or ICS.
- **Stable URLs.** Avoid signed/expiring CDN URLs where possible; prefer the
  venue's canonical image.
- Event resolutions edit the committed `event-uncertainty-cache.json`;
  commit them in the same PR (CI reads the committed file — no S3). See
  `docs/github-native-caches.md`.
- This skill is the handler invoked from the build-report skill's Photo
  Coverage Check (step 5.6) and complements `source-from-event` (poster images).
