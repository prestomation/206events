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

A naïve fix — diff the copy's tree against `upstream/main` and call the engine
delta "features" — **does not work**, because without a merge-base a tree diff
can't tell an upstream change apart from the copy's own per-city rebrand
(`206.events` → your domain, `Seattle` → your city) of shared engine files. On
a fresh copy that rebrand is most of the diff and buries the real features.

So the detector (`scripts/feature-sync.ts`) scopes to commits upstream landed
**since this copy's baseline** (`git log <baseSha>..upstream/main`). Those
commits define the candidate engine files; rebrand-only files the copy touched
but upstream didn't are never considered. A committed ledger
(`feature-sync.json`) holds the baseline (`lastSyncedSha`) and remembers each
decision so it's never re-asked.

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

### 2. Establish the baseline (first run only)

The detector needs a **baseline** — the upstream commit this copy is reconciled
up to — recorded as `lastSyncedSha` in `feature-sync.json`. Detection scans
`lastSyncedSha..upstream/main`, which is what keeps the copy's own per-city
rebrand out of the results.

If `lastSyncedSha` is already set, skip to step 3. If it's `null` (a copy that
hasn't synced before), establish it as the upstream commit the copy was
**templated from** — i.e. the upstream state at fork time:

```bash
# Approximate fork time from the copy's earliest commit, then find the
# upstream commit at/just before it.
FORK_DATE=$(git log --max-parents=0 -1 --format=%cI)        # root commit timestamp
BASE=$(git log upstream/main -1 --until="$FORK_DATE" --format=%H)
echo "proposed baseline: $BASE  $(git log -1 --format='%ci %s' "$BASE")"
```

**Confirm the date/commit with the owner** (the heuristic can be off if the
copy rebased or squashed its early history), then write it into the ledger and
commit:

```bash
# set lastSyncedSha to $BASE in feature-sync.json, then commit
```

For a one-off run without committing a baseline, pass `--since <ref>` to the
detector instead (e.g. `--since upstream/main~30`).

### 3. Run the detector

```bash
npm run feature-sync -- --json
```

It prints `{ ref, refSha, baseSha, ledger, features }`. Each **feature** has:

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

### 4. Describe each feature and ask the owner

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

### 5. Apply the decisions

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

### 6. Update and commit the ledger

Edit `feature-sync.json`:

- Set `lastSyncedSha` to the detector's `refSha` (advancing the baseline to the
  upstream HEAD you just reconciled against, so the next run only sees what
  lands after it).
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
historical delta, set the baseline to an older upstream commit with `--since`:

```bash
npm run feature-sync -- --since upstream/main~30   # features upstream added in the last 30 commits
```

The clustering/ledger/selection logic is unit-tested in
`scripts/feature-sync.test.ts`. The detector was validated against a real
recent template copy (a Houston fork): a naïve tree diff reported 54 false
"features" (almost all of them the copy's own rebrand), while the
baseline-scoped detector correctly reported the 2 genuine recent upstream
features.

## Notes

- **One PR per feature** — respects AGENTS.md's merge-eligibility matrix; the
  owner reviews and merges each.
- **The ledger is the memory.** Never re-ask a decided feature; that's the
  whole point of `feature-sync.json`.
- **Content and config are never surfaced.** The detector restricts to engine
  paths (see `classifyPath` in `scripts/feature-sync.ts`), so your city's
  sources, caches, and `city.config.ts` are never proposed for overwrite.
