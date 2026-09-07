---
name: duplicate-resolver
description: Drain the non-fatal duplicateCandidates queue in build-errors.json — confirm or reject MED-confidence cross-source duplicate pairs by writing decisions into event-duplicate-cache.json via a PR.
---

# Duplicate Resolver

Resolve outstanding **cross-source duplicate candidates** — pairs of events
that the build-time matcher (`lib/cross-source-dedup.ts`) thinks *might* be the
same real-world event but isn't confident enough to merge automatically.

HIGH-confidence matches are merged at build time with no human involvement.
This skill only handles the **MED** tier (the `duplicateCandidates` queue):
campus-scale venues, coordless listings, and title variants where a human (or
LLM) judgment call is needed. See `docs/cross-source-event-dedup.md`.

## How it works

- The build publishes `duplicateStats` + `duplicateCandidates` in
  `build-errors.json` (and every reporting surface).
- Each candidate has a stable `key` (the unordered pair of the two events'
  `icsUrl + summary + date`), the two events, and the match scores.
- You decide **confirmed** (they ARE the same event) or **rejected** (they are
  NOT). The decision is written to the committed `event-duplicate-cache.json`.
- The next build reads the cache: `confirmed` pairs are merged (collapse +
  attribute, exactly like a HIGH match); `rejected` pairs are kept separate and
  never re-proposed.

This is a non-fatal, self-limiting queue — like the photo/cost resolvers, it
drains across builds and does not block CI.

## Procedure

### 0. Sweep this queue's prior open PRs (mandatory)

**Before reading the queue**, close out the open PRs left by earlier duplicate
drains. The full rule is *Step 0* under "Queue Draining — Work Until Empty" in
`AGENTS.md`; the short version:

List open PRs whose branch or title marks them as a drain of this queue
(`duplicate-resolver-*`, "duplicateCandidates"), plus any multi-queue "Queue drain" PR — those
usually touch this cache too. For each, run the supersession check:

```sh
python3 scripts/drain-pr-sweep.py <pr-merge-base-sha> <pr-head-ref>
```

- **`SUPERSEDED`** → close the PR, with a comment naming what superseded it.
  Nothing is lost — the queue re-surfaces anything still outstanding.
- **`HAS-NOVEL-WORK`** → close it too (a stale drain branch conflicts in the
  cache and can't be rebased), but first read the keys it lists, along with
  their resolutions and evidence, and carry them into **this** run's batch.
  That investigation is the valuable part; re-deriving it wastes the run.
  Two labels are *not* to be carried blindly: a `!=main` suffix means `main`
  holds a different — often newer — value for that field, and
  `<unresolvable-but-main-resolved>` means `main` has since answered what the
  PR gave up on. Check those before overwriting anything.
- **`NOT-APPLICABLE`** → the PR changes no cache the script reads, so nothing
  was examined and nothing is shown to be superseded. **Don't close on this
  verdict** — sweep it by `grep` against `main` instead. This is a normal shape
  here, not an edge case: a venue-photo or uniform-`cost:` PR edits source YAML
  only.
- **Opened by an in-flight run** (green CI, under a day old) → leave it, and
  exclude its keys from your batch so the two runs don't collide.

Also check by `grep` whether any non-cache change riding along in a stale PR (a
ripper fix, a source-YAML edit) landed on `main`; if it didn't and it's still
worth having, port it fresh onto `main` rather than reviving the branch.

Skipping this step is how the same events get re-investigated run after run
while the earlier PR sits open and unmergeable.

### Then work the queue

1. **List the queue:**
   ```sh
   python3 skills/duplicate-resolver/scripts/duplicate-cache.py candidates --limit 30
   ```

2. **For each candidate, decide if the two events are the same occurrence.**
   Use the titles, locations, and `url`s. Confirm only when you're confident
   they're the same real-world event (same festival/show, same day, same
   place). When in doubt, **reject** — a wrong merge hides a real event, which
   is worse than a visible duplicate.

   Typical patterns:
   - **Same event, campus venue** (e.g. one feed says "Seattle Center", another
     "Armory, 305 Harrison St") → **confirmed**.
   - **Same event, title variant** (a "Festal:" prefix, a presenter prefix) at
     the same place/day → **confirmed**.
   - **Different events that share words** ("Bumbershoot" the festival vs.
     "Bumbershoot | Videorama" a film screening about it) → **rejected**.
   - **Same title, genuinely different venues** (a chain's two locations) →
     **rejected**.

3. **Write each decision:**
   ```sh
   python3 skills/duplicate-resolver/scripts/duplicate-cache.py resolve \
     --key "<key from the queue>" \
     --decision confirmed \
     --note "Same Seattle Center festival, two feeds"
   ```
   Use `--decision rejected` for non-matches. `--force` overwrites an existing
   decision.

4. **Commit `event-duplicate-cache.json` and open a PR.** CI reads the
   committed file directly; once merged, the next build applies the decisions.

5. **Report a summary** in your reply:
   ```
   🔀 Duplicate resolver: C confirmed, R rejected, Q remaining
   ```

## Notes

- Decisions are keyed per `(event, event)` pair and include the date, so a
  recurring cross-source duplicate is resolved per occurrence (matching the
  cache design of the other resolvers).
- Never hand-edit `event-duplicate-cache.json` for anything other than these
  decisions; the build owns the matching, you own the confirm/reject.
