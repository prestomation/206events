# Proxy Verification & Auto-Escalation

How 206.events proves which proxy rung a source needs **before merging it**, and
climbs the proxy escalation ladder for live sources that later degrade.

## Two flows

1. **Prove-before-merge (Mode A) — new sources.** A source that CI blocks is
   **not merged**. `skills/source-discovery/SKILL.md` leaves its PR **open** and
   labels it `requires-proxy-testing`. The out-of-band generate job
   (`skills/outofband-generate/SKILL.md`) runs `skills/proxy-escalation/SKILL.md`
   **first**, which checks each staged PR out locally, tests the ladder
   (`outofband` then `browserbase`) from the residential environment where those
   paths actually work, and **merges the lowest working rung** — or **closes** the
   PR and marks the candidate `blocked` when no rung works. Nothing hits `main`
   until a rung is proven. (Browserbase credit/billing exhaustion is *not* a
   failure — the PR is left open and retried when credits return.)

2. **Auto-escalation (Mode B) — live sources that degrade.** A source already on
   `main` that was reachable via a proxy but has since failed 3 consecutive times
   climbs the next rung (or retires), driven by the automated
   `pendingProxyVerification` counter described below. This is the backstop for
   drift after a source was proven — including a Mode-A `outofband` source that
   the real residential runner later can't reach.

**build-report does not drive either flow.** It runs in the CI-style environment
where the proxy paths can't be exercised, so it only *reports* the queue; the
out-of-band run is the sole actuator. The rest of this document details the
counter mechanism (Mode B) and the fatal-gate exemption that keeps an unproven
proxy source from reddening `main`.

## The problem

The proxy escalation ladder (`docs/outofband.md`) is
`false → outofband → browserbase`. A source that 403s from GitHub Actions IPs is
added with `proxy: "outofband"` on the belief that a residential IP can reach
it. But that belief **cannot be proven in the PR/main build**:

- The out-of-band cron runner hasn't fetched the source yet, so the main build
  simply skips it (no report entry).
- Once the cron *does* run, the residential fetch might **still fail** — e.g. a
  SiteGround JS captcha (`sgcaptcha`) blocks even residential IPs, not just
  datacenter ones.

Before this system, that second case was indistinguishable from a genuinely
broken source. A newly-added outofband source that failed out-of-band produced
an external with 0 events, which — because it had never appeared in production —
tripped the **fatal "new source produced 0 events" gate** in
`lib/calendar_ripper.ts`. `expectEmpty` does *not* exempt new sources (by
design), so `main` went red for a source that was still legitimately under
verification. (This is exactly what happened to El Centro de la Raza, PR #453.)

There was no **probationary state**: no way to say "we think this needs a proxy,
let the out-of-band runner test it, and don't count a failure against `main` —
instead use it as a signal to climb the ladder."

## The design

Three parts: an **implicit exemption** (the bug fix), a **tracked queue**
(visibility), and **auto-escalation** driven by the out-of-band job (the
forcing function). N = **3** consecutive failures per rung; terminal behavior =
**disable + mark blocked**.

### 1. Implicit exemption (`lib/calendar_ripper.ts`)

Any source with `proxy: "outofband"` or `proxy: "browserbase"` that has **never
appeared in the production manifest** is exempted from the fatal new-zero-event
gate. It can sit at 0 events without reddening `main`. Direct (`proxy: false`)
sources keep the strict rule — they're fetched in CI, so zero events is still
fatal (the pipeline genuinely can be proven there).

This is computed locally from the configs + the deployed-manifest check the
build already does, so it works even with no S3 and no report (e.g. fork PRs).

### 2. Tracked queue (`pendingProxyVerification`)

A non-fatal category in `output/build-errors.json`, one entry per proxy source
still climbing the ladder:

```json
{
  "name": "el-centro-de-la-raza",
  "rung": "outofband",
  "consecutiveFailures": 3,
  "lastError": "HTTP 403",
  "lastAttempt": "2026-06-03",
  "proven": false,
  "recommendation": "promote-to-browserbase"
}
```

`recommendation` is one of:

| Recommendation | Meaning |
|---|---|
| `verifying` | Under the 3-failure budget — keep trying, no action. |
| `promote-to-browserbase` | `outofband` failed 3× → bump to `browserbase`. |
| `retire` | `browserbase` failed 3× → disable + mark blocked. |
| `graduate` | Proven and currently healthy → drop from the queue (not surfaced). |

Per the **Reporting Parity** rule, this category is plumbed through every
reporting surface: the PR comment (`.github/workflows/pr-preview.yml`), the main
build step summary (`lib/calendar_ripper.ts`), the Discord notification
(`.github/workflows/notify-discord.yml`), the website health dashboard
(`web/src/components/HealthDashboard.jsx`, a "Proxy" tab), and the build-report
skill (`skills/build-report/`, step 5.5).

### 3. The counter (`proxy-verification.json`, S3)

The **out-of-band cron runner** (`scripts/generate-outofband.ts`) is the **sole
writer** of the failure counters. This keeps a single source of truth and avoids
write races. Each run it:

1. Downloads `latest/proxy-verification.json` from S3 (or starts empty).
2. Determines this run's outcome for every configured proxy source:
   - **`outofband` sources** — from its own residential fetch this run
     (reachable = produced future events, or produced calendars with no errors;
     a block surfaces as an error with no future events).
   - **`browserbase` sources** — from the published
     `https://206.events/build-errors.json` (browserbase is fetched live in the
     main CI build, not here): a name in `externalCalendarFailures` is a
     failure; a name *present* in `eventCounts` is a success (failed fetches are
     never added to `eventCounts`, so presence means reachable — this counts a
     legitimately-empty `expectEmpty` browserbase source as reachable too); no
     signal this run → carried forward unchanged.
3. Folds the outcomes into the counters via
   `evaluateProxyVerification(prev, outcomes, today, knownSources)`
   (`lib/proxy-verification.ts`, pure + unit-tested): increment on failure,
   reset to 0 on success or on a rung change, prune sources no longer carrying a
   proxy, carry forward sources with no determinable outcome.
4. Writes `pendingProxyVerification` into `outofband-report.json` (which the
   main build already downloads and surfaces) and uploads the updated
   `proxy-verification.json` back to S3.

The raw counter file is **not** downloaded into `output/` by
`download-outofband.ts` — it's the runner's private state; the main build only
consumes the derived `pendingProxyVerification` from the report.

This bookkeeping is **skipped on filtered (`--sources`) runs** so a partial run
can't miscount or prune sources it didn't look at, and it is wrapped so a
bookkeeping failure never fails the out-of-band run.

### 4. Auto-escalation (`skills/proxy-escalation/SKILL.md`)

The **proxy-escalation skill** is run by the out-of-band generate job
(`skills/outofband-generate/SKILL.md`, step 3), which invokes it **before**
generating calendars. It first drains the Mode-A `requires-proxy-testing` staged
PRs (test the ladder, merge or close), then reads the `pendingProxyVerification`
queue for Mode B and opens **one PR per source**:

- `promote-to-browserbase` → change `proxy: outofband` to `proxy: browserbase`.
  Broken-source repair — auto-merge-eligible once green.
- `retire` → set `disabled: true` **and** flip
  `docs/source-candidates/<slug>.md` to `status: blocked` with the full ladder
  history. The daily discovery cron then won't re-propose it. This is a "we give
  up" decision — **left for human merge**, not auto-merged.

One rung per PR preserves the long-standing "observe each failure before
escalating" rule — now automated rather than manual.

## Lifecycle, end to end

### Mode A — prove before merge (new source)

```
source-discovery: CI blocks the source
        │  (PR left OPEN at proxy: false, labelled requires-proxy-testing; nothing on main)
        ▼
out-of-band job → proxy-escalation (Mode A) checks the PR out and tests the ladder
        │
        ├── outofband works ────────► set proxy: outofband, MERGE the PR
        │
        ├── browserbase works ──────► set proxy: browserbase, MERGE the PR
        │
        ├── browserbase 402 / no credits ─► leave PR open, retry next run (NOT a failure)
        │
        └── neither works ──────────► CLOSE the PR + candidate doc status: blocked
                                       + discovery-log ⛔ entry (separate docs PR)
```

### Mode B — degradation of a live source (backstop)

```
source already on main via a proxy, now failing
        │  (main build: exempt from fatal gate for unproven proxy sources)
        ▼
out-of-band cron fetches it
        │
        ├── reachable ───────────────► events flow; entry graduates; remove from queue
        │
        └── 403 / blocked ──► failures 1, 2, 3 ──► recommendation: promote-to-browserbase
                                                          │
                                       proxy-escalation skill opens PR → proxy: browserbase
                                                          ▼
                              main build fetches it live via Browserbase
                                                          │
                                ├── reachable ──────────► events flow; graduates
                                │
                                └── blocked 1, 2, 3 ──► recommendation: retire
                                                          │
                                       proxy-escalation skill opens PR →
                                       disabled: true + candidate doc status: blocked
                                       (left for human merge)
```

## Files

| File | Role |
|---|---|
| `lib/proxy-verification.ts` | Pure counter/queue logic (unit-tested). |
| `lib/proxy-verification.test.ts` | Unit tests for evaluate / recommend / pending. |
| `lib/calendar_ripper.ts` | Fatal exemption + surfaces `pendingProxyVerification`. |
| `scripts/generate-outofband.ts` | Sole writer of `proxy-verification.json`; computes outcomes. |
| `scripts/download-outofband.ts` | Skips the private counter file. |
| `skills/source-discovery/SKILL.md` | Stages a CI-blocked source: open PR + `requires-proxy-testing` label (Mode A input). |
| `skills/outofband-generate/SKILL.md` | Out-of-band job; runs proxy-escalation first, then generates. |
| `skills/proxy-escalation/SKILL.md` | The actuator — drains staged PRs (Mode A) and the counter queue (Mode B). |
| `skills/build-report/` | **Reports** the queue (step 5.5) only — does **not** run the skill. |

## Parameters

- **Escalation threshold:** 3 consecutive failures per rung
  (`ESCALATION_THRESHOLD` in `lib/proxy-verification.ts`).
- **Terminal behavior:** disable + mark the candidate doc `blocked`.
