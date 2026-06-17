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
