---
name: upstream-feature-sync
description: For template copies only — discover engine features added to the upstream 206.events repo (prestomation/206events) that this copy doesn't have yet, describe each one to the owner, and stage the ones they choose to merge as per-feature draft PRs. Never run on the reference instance.
---

# Upstream Feature Sync

Help a **template copy** pull engine improvements from the upstream repo
(`prestomation/206events`) without dumping the whole divergence on the owner at
once. The skill diffs this copy against `upstream/main`, groups the engine
changes into named **features**, asks the owner to decide on each
(**merge / skip / defer**), and stages the chosen ones as per-feature draft PRs.

The owner always decides. This skill surfaces and prepares; it never
auto-merges. That matches AGENTS.md's rule that engine/infrastructure changes
require manual merge.

## Why this skill exists

"Use this template" produces a repo with **unrelated history** to upstream —
there's no merge-base, so the plain `git merge upstream/main` recipe in
`docs/city-template.md` ("Upgrade story") brings everything at once with no
per-feature framing and no memory of what the owner already declined.

The repo's clean **engine / content / config** separation (see
`docs/city-template.md`) makes a *content-based* comparison tractable: a copy
deletes Seattle content once and never recreates those paths, so the engine
delta against `upstream/main` is exactly the set of candidate features. The
detector (`scripts/feature-sync.ts`) clusters that delta and a committed ledger
(`feature-sync.json`) remembers each decision so it's never re-asked.

See `docs/upstream-feature-sync.md` for the full design.

## When to run

- The owner asks to "check for upstream updates / new features", "sync with
  upstream", or "what's new in 206.events that I don't have".
- Periodically (owner-initiated — this is **not** an auto-scheduled routine;
  pulling engine changes is a human-review decision).

## Guard: copies only

**Never run this on the reference instance.** If `city.config.ts` still has
`site.name: "206.events"` and the owner hasn't re-cited the repo, you're on
upstream itself — there is nothing to sync. Stop and say so.

```bash
tsx scripts/print-city-config.ts site.name   # bail if this prints "206.events"
```

## Steps

### 1. Add and fetch the upstream remote

Idempotent — safe to re-run:

```bash
git remote get-url upstream 2>/dev/null || \
  git remote add upstream https://github.com/prestomation/206events
git fetch upstream main
```

### 2. Run the detector

```bash
npm run feature-sync -- --json
```

It prints `{ ref, refSha, ledger, features }`. Each **feature** has:

- `id` — stable key (a `docs/<name>.md` path, or `commit:<slug>` for doc-less
  changes). The ledger is keyed on this.
- `title`, `kind` (`doc` | `commit` | `minor`), `sha` (anchoring upstream
  commit), `files` (the engine files it would bring in, with `A`/`M`/`D`
  status), and `needsCarefulMerge`.

Features already decided in `feature-sync.json` are filtered out (pass `--all`
to see them too). If the list is empty, the copy is up to date — report that
and stop.

**Status meanings** (relative to going from your copy to upstream):

- `A` — upstream has a file you don't (most new features).
- `M` — a file you both have, changed upstream.
- `D` — upstream **removed** a file you still have (a refactor/removal, or a
  file your copy added locally). Treat `D` with extra care — confirm it's an
  upstream removal you want, not your own local addition.

`needsCarefulMerge: true` means the feature includes a mixed engine/content
file (currently `lib/geocoder.ts`, which interleaves engine logic with Seattle
lookup tables). Take the **logic** changes by hand; do not clobber your city's
lookup tables.

### 3. Describe each feature and ask the owner

For each surfaced feature, build a short description:

- For `kind: doc`, read the design doc (`git show upstream/main:<path>`) and
  summarize its intent in a sentence or two.
- For `kind: commit`, use the `title` (the upstream PR subject) plus the file
  list and a diffstat (`git diff --stat HEAD upstream/main -- <files…>`).

Then use **`AskUserQuestion`** — one question per feature (batch up to 4 at a
time), options **Merge / Skip / Defer**, with the summary, file list, and
diffstat in the question text so the owner can decide without digging. Lead
with a recommendation when one is clear (e.g. a pure bug fix → Merge; a UI/
schema change → the owner's call).

### 4. Apply the decisions

For each **Merge**:

1. Branch from the current main: `git checkout -b feature-sync/<slug>`.
2. Pull in just this feature's files:
   `git checkout upstream/main -- <file> <file> …`
   (for `D` files you've confirmed you want removed: `git rm <file>`).
3. **Resolve conflicts with your city.** If a file imports `city.config.ts`,
   touches `lib/geocoder.ts` tables, or references content paths, reconcile by
   hand so your city's values survive. `needsCarefulMerge` files always need
   this.
4. Verify: `npm run typecheck && npm run test:all` (add `npm run
   generate-calendars` if the feature touches the build, and the web e2e suite
   if it touches `web/src/**` — see AGENTS.md "UI Changes").
5. Open a **draft PR** for this feature alone, following AGENTS.md's
   Development Workflow (one feature per PR). Note in the PR body that it was
   staged by `upstream-feature-sync` and cite the upstream `sha`.

For **Skip** and **Defer**: make no code change; just record the decision
(next step). A *skipped* feature stays hidden unless its upstream commit later
changes; a *deferred* one is the same mechanically but signals "revisit later"
to the owner.

### 5. Update and commit the ledger

Edit `feature-sync.json`:

- Set `lastSyncedSha` to the detector's `refSha`.
- For every feature you acted on, add a `decisions[<id>]` entry:
  `{ "decision": "merged" | "skipped" | "deferred", "sha": "<feature.sha>",
  "decidedAt": "<ISO date>", "pr": <number if merged> }`.

Commit the ledger. For **merged** features it rides along in that feature's PR;
for **skip/defer**-only runs, commit the ledger update on its own small branch/
PR so the decisions persist (the ledger is the copy's memory — an uncommitted
edit is lost when the session ends).

## Dry run / testing this skill

The skill is a no-op on the reference instance by design (it *is* upstream), so
it can't be exercised end-to-end here. To sanity-check the detector against a
historical delta, point it at an older ref:

```bash
npm run feature-sync -- --ref upstream/main~30   # what THAT tree lacks vs HEAD
```

The clustering/ledger logic is unit-tested in `scripts/feature-sync.test.ts`.

## Notes

- **One PR per feature** — respects AGENTS.md's merge-eligibility matrix; the
  owner reviews and merges each.
- **The ledger is the memory.** Never re-ask a decided feature; that's the
  whole point of `feature-sync.json`.
- **Content and config are never surfaced.** The detector restricts to engine
  paths (see `classifyPath` in `scripts/feature-sync.ts`), so your city's
  sources, caches, and `city.config.ts` are never proposed for overwrite.
