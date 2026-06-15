# Upstream Feature Sync

How a template copy discovers engine features added to the upstream
`prestomation/206events` repo and decides, feature by feature, whether to pull
them in.

## The problem

This repo is a GitHub **template** (`docs/city-template.md`). Copies are made
with "Use this template," which produces a repo with **unrelated history** —
there is no shared commit, so no merge-base to diff against. The original
upgrade path (`docs/city-template.md` → "Upgrade story") is a manual
`git merge upstream/main --allow-unrelated-histories`. That works, but it:

- dumps the *entire* divergence on the owner in one conflict-laden merge,
- gives no per-feature framing (what is this change, is it worth taking?), and
- has no memory — a feature the owner deliberately skips comes back every time.

"Automatic upstream tracking" was an explicit **non-goal** of the template
design. This feature is the assisted middle ground: **owner-in-the-loop**
discovery and staging, not silent auto-updates.

## What makes it tractable: engine / content / config

The template architecture sorts every path into three buckets
(`docs/city-template.md`):

| Bucket | Examples | A copy… |
|---|---|---|
| **ENGINE** | `lib/`, `scripts/`, `web/`, `skills/`, `.github/`, `infra/`, top-level design docs, `index.ts`, `package.json` | shares with upstream |
| **CONTENT** | `sources/`, candidate/discovery docs, caches, `ideas.md`, per-city prose | deletes once and regrows; never recreates the same paths |
| **CONFIG** | `city.config.ts` | edits for its city |

Because a copy never recreates upstream's content paths, a **content-filtered
diff** against `upstream/main` is almost exactly the set of engine changes the
copy is missing. That's the candidate feature set — no merge-base required.

## How a "feature" is identified

Engine changes are grouped, not dumped as a flat file list. The grouping is
**layered** because — measured against this repo's own history — only about
**half** of engine-touching merges ship a `docs/<feature>.md`. Anchoring purely
on design docs would silently drop the other half (UI tweaks, ripper-infra,
small fixes). So every engine change lands in exactly one of:

1. **Design-doc anchored** (`kind: doc`) — a new/changed `docs/<name>.md` names
   the feature; the engine files its introducing commit touched are bundled
   with it. The doc path is the feature's stable `id`.
2. **Squash-commit anchored** (`kind: commit`) — doc-less engine changes are
   grouped by the upstream commit that owns them. This repo squash-merges, so
   one commit ≈ one PR, and the commit subject is a serviceable feature title.
   `id` is `commit:<slugified-subject>`.
3. **Minor** (`kind: minor`) — leftover dependency/lockfile churn
   (`package.json`, `package-lock.json`, …) collapses into a single bucket the
   owner can take wholesale or skip.

Files whose owning commit isn't in the scanned log window surface as an
`orphan:<path>` feature rather than being dropped.

`lib/geocoder.ts` is a known **mixed** file — engine logic interleaved with
Seattle lookup tables — so any feature including it is flagged
`needsCarefulMerge`, and the skill takes the logic by hand without clobbering
the city's tables.

## Components

| Piece | Role |
|---|---|
| `scripts/feature-sync.ts` | Detector. Diffs `HEAD` vs the ref, filters to engine paths (`classifyPath`), clusters into features (`groupFeatures`), filters out ledger-decided ones (`filterDecided`). Pure logic is unit-tested; the git glue is a thin CLI. |
| `scripts/feature-sync.test.ts` | Unit tests for classification, grouping, and ledger filtering. |
| `feature-sync.json` | The **ledger** — committed per-copy memory of every decision, keyed by feature `id`. Ships empty; `init-city` resets it for a fresh copy. |
| `skills/upstream-feature-sync/SKILL.md` | The procedure: guard → fetch → detect → describe → ask (`AskUserQuestion`) → stage merges as per-feature draft PRs → update the ledger. |
| `npm run feature-sync` | Entry point (`--json`, `--all`, `--ref <ref>`). |

## The ledger (`feature-sync.json`)

```json
{
  "upstreamRepo": "prestomation/206events",
  "lastSyncedSha": "<upstream sha at last reconciliation>",
  "decisions": {
    "docs/design-geo-subscribe.md": {
      "decision": "merged", "sha": "abc123", "decidedAt": "2026-06-15", "pr": 42
    },
    "commit:tweak-loading-spinner": {
      "decision": "skipped", "sha": "def456", "decidedAt": "2026-06-15"
    }
  }
}
```

- **merged** features are never surfaced again.
- **skipped** / **deferred** features stay hidden *unless their anchoring
  upstream commit changes* (`filterDecided`), so a reworked upstream feature
  gets a fresh look while an unchanged one stays quiet.

The committed file is the source of truth — an uncommitted edit is lost when
the session ends, so skip/defer-only runs still commit the ledger.

## Why owner-in-the-loop, never auto-merge

These changes are ENGINE/infrastructure, which AGENTS.md's merge-eligibility
matrix classifies as **manual-merge**. The skill stages each chosen feature as
its own draft PR with verification (`typecheck` + `test:all`, plus build/e2e
when relevant) and lets the human merge. It never enables auto-merge.

## Relationship to the manual upgrade path

This does not replace `git merge upstream/main` — that remains the documented
fallback for an owner who wants everything at once (see `docs/city-template.md`,
"Upgrade story"). Feature-sync is the curated, incremental alternative.

## Limitations

- **Detection is content-based, not semantic.** A feature split across commits
  with no shared doc may surface as several `commit:` features; the owner can
  still merge them together.
- **`D` (upstream-removed) entries need judgment.** A file upstream deleted and
  a file the copy added locally both appear as `D`; the skill flags this for
  manual confirmation.
- **Log window.** The detector scans a bounded number of recent upstream
  commits to attribute files; files older than the window surface as
  `orphan:` features rather than being missed.
