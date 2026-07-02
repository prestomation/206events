# 206.events Proxy Escalation

Drive proxy-marked calendar sources up the fetch-proxy escalation ladder
(`false → outofband → browserbase → disabled`). Two responsibilities:

- **Mode A — verify staged sources *before* they merge.** A new source that CI
  blocks is left as an **open, unmerged PR** labelled `requires-proxy-testing`.
  Nothing lands on `main` until a proxy rung is proven to work. This mode drains
  those PRs: check each out locally, test the ladder rung by rung, **merge** the
  PR at the lowest rung that works, or **close** ("throw away") the PR when no
  rung works.
- **Mode B — escalate already-live sources that have degraded.** A source that
  was working via a proxy but has now failed 3 consecutive times climbs the next
  rung (or retires), driven by the automated `pendingProxyVerification` queue.

**This skill runs from inside the out-of-band generate job**
(`skills/outofband-generate/SKILL.md`) — the residential environment where the
`outofband` (plain fetch from a non-CI IP) and `browserbase` fetch paths
actually work. It is invoked **first**, before that job generates calendars.
It is **not** run from the build-report skill: build-report runs in the CI-style
environment where these proxy paths can't be exercised, so it can only *report*
the queue, not act on it.

## Why this skill exists

A source that 403s from GitHub Actions IPs needs a proxy, but which rung works
(`outofband` vs `browserbase`) can't be proven in the CI/PR build:

- The out-of-band runner fetches from a residential IP — it can reach sources CI
  can't, so `outofband` is only verifiable *here*.
- Even a residential fetch can fail (e.g. a SiteGround JS captcha, `sgcaptcha`,
  blocks residential IPs too), in which case only `browserbase` (which executes
  JS) works.

Rather than merge an unproven source and discover the answer over many builds,
**Mode A proves the rung here and merges only what works.** Mode B remains the
backstop for a live source that later degrades: the out-of-band cron runner
(`scripts/generate-outofband.ts`) is the sole writer of `proxy-verification.json`
in S3, maintaining a per-source consecutive-failure counter; after **3
consecutive failures** at a rung a source is due to climb, and this skill acts on
that queue.

See `docs/proxy-verification.md` for the full design and `docs/outofband.md` for
the out-of-band architecture.

## When to run

Invoked at the **start of every out-of-band generate run**
(`skills/outofband-generate/SKILL.md`, before it generates calendars), and
runnable on demand. Do both modes, in order:

1. **Mode A first** — drain any open `requires-proxy-testing` PRs (below).
2. **Then Mode B** — act on the `pendingProxyVerification` queue.

If there are no `requires-proxy-testing` PRs and every `pendingProxyVerification`
entry is `verifying` (within the 3-failure budget), there is **nothing to do** —
report and stop.

---

## Mode A — verify staged `requires-proxy-testing` PRs (run first)

`skills/source-discovery/SKILL.md` stages a new source that CI blocks by leaving
its PR **open and unmerged** with the `requires-proxy-testing` label, instead of
merging it speculatively. Drain these before Mode B and before the generate job.

### A1. Find staged PRs

```
mcp__github__search_pull_requests  q: "repo:prestomation/206events is:open is:pr label:requires-proxy-testing"
```

If none, skip to **Mode B**. Otherwise handle each PR in turn.

### A2. Check the PR out locally and identify the source

```bash
git fetch origin <pr-branch>
git checkout <pr-branch>
git rev-list HEAD..origin/main | grep -q . && git rebase origin/main   # rebase only if behind
```

From the PR diff, find the source's config file:

- **External calendar:** `sources/external/<name>.yaml`
- **Ripper:** `sources/<name>/ripper.yaml`

### A3. Ladder-test locally — lowest working rung wins

For each rung **in order**, set the source's `proxy:` field, then build only that
source and read its event count from `output/build-errors.json` (event counts /
`zeroEventCalendars` / `externalCalendarFailures`) plus the produced `.ics`:

```bash
ONLY_SOURCE=<name> FETCH_CACHE_TTL_HOURS=99999 npm run generate-calendars
```

| Order | Rung | Set in YAML | Success |
|-------|------|-------------|---------|
| 1 | outofband | `proxy: "outofband"` | ≥1 future event, no fetch failure |
| 2 | browserbase | `proxy: "browserbase"` | ≥1 future event, no fetch failure |

- **Rung 1 (`proxy: false`) is skipped.** The source is staged precisely because
  CI's direct fetch is blocked, and that CI IP isn't reproducible here. Because
  this runs from the residential out-of-band environment, a plain fetch here
  **is** the `outofband` rung.
- Stop at the **first** rung that returns events.
- **⚠️ Browserbase 402 / "Payment Required" / credits or billing exhausted is
  NOT a ladder failure.** All browserbase fetches fail at once when Browserbase
  billing lapses — that says nothing about the source. Do **not** close the PR
  and do **not** treat browserbase as "failed". Leave the PR open with its label,
  report `browserbase untested — Browserbase credits/billing exhausted; retry
  when restored`, and move to the next PR. The next run retries it once credits
  are back.
- **Transient/infra errors** (network timeout, our proxy `407`, a temporary
  `5xx`) are likewise not ladder failures — leave the PR open and retry next run.
  Only a genuine block (`403`, JS challenge, `0` events with a real response
  body) counts against the rung.

### A4. A rung works → merge the PR at that rung

1. Keep the working `proxy:` value in the YAML.
2. Flip `docs/source-candidates/<slug>.md` frontmatter to `status: proxy`, note
   the working rung in the body, and bump `lastChecked`.
3. Commit to the PR branch and push:
   ```bash
   git commit -am "proxy: <rung> — verified locally (<N> events)"
   git push
   ```
4. Run the `code-reviewer` subagent on the diff (per AGENTS.md), convert the PR
   to ready-for-review, resolve threads. A verified proxy source is a
   broken-source repair → **auto-merge-eligible** once green (squash).
5. The `requires-proxy-testing` label can be left as-is (the PR is being merged);
   optionally clear it with `mcp__github__issue_write` (`method: update`,
   `issue_number: <pr>`, `labels: []`).

### A5. No rung works → close ("throw away") the PR and log findings

1. Post a top-level comment (`mcp__github__add_issue_comment`) documenting each
   rung's result — status codes, JS-challenge evidence, event counts — e.g.
   *"outofband: HTTP 403; browserbase: 11 KB `sgcaptcha` JS challenge, 0 events.
   Proxy ladder exhausted; closing."*
2. Close the PR: `mcp__github__update_pull_request` (`state: closed`).
3. Record the findings **in the local workspace** on a **separate** small docs
   PR (the closed branch is discarded, so its changes won't merge):
   - Add a `docs/discovery-log/YYYY-MM-DD.md` entry:
     `- ⛔ Blocked: <name> — proxy ladder exhausted (outofband + browserbase both blocked), PR #NNN closed`
   - Flip `docs/source-candidates/<slug>.md` frontmatter to `status: blocked`
     with the full ladder history in the body. The daily discovery cron then
     won't re-propose it.
4. Continue to the next staged PR, then fall through to **Mode B**.

---

## Mode B — escalate degraded live sources (`pendingProxyVerification`)

This is the automated counter queue for sources **already on `main`** that were
working via a proxy and have since failed 3 consecutive times. One escalation per
PR.

### B1. Read the queue

Fetch the live queue from the published report:

```bash
curl -s https://206.events/build-errors.json | jq '.pendingProxyVerification'
```

Each entry looks like:

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

Act only on entries whose `recommendation` is `promote-to-browserbase` or
`retire`. Ignore `verifying` (under budget) and `graduate` (already healthy).

**⚠️ HTTP 402 = Browserbase billing issue — do NOT retire.**
Before acting on any `retire` entry, check `lastError`. If it contains `402`
or `Payment Required`, this is a Browserbase account payment problem, not a
source failure. All browserbase sources fail simultaneously when billing lapses.
**Do not open retirement PRs.** Instead, report the billing issue:

```
🚨 Browserbase billing issue: N sources showing HTTP 402 (Payment Required).
   This is a provider billing problem, not source blocking.
   Sources affected: <list>
   Action required: check Browserbase account payment status.
   No retirement PRs opened — sources will recover when billing is restored.
```

Stop Mode B here — do not proceed to steps B3a/B3b for 402 entries.

**⚠️ JS challenge = skip outofband, go straight to browserbase.**
When investigating a queue entry, check whether the response body is a
JavaScript bot-challenge page. Indicators: `window.location.reload()`,
`sgcaptcha`, Cloudflare challenge HTML, or an openresty/nginx JS-redirect page.
If confirmed, skip the `outofband` rung and open a PR setting
`proxy: "browserbase"` directly. Document the evidence (e.g., "curl returns
11 KB JS challenge page") in the PR body. Outofband is a plain HTTP fetch from a
residential IP and cannot execute JavaScript — it will get the same challenge.
(In **Mode A** the same shortcut applies: if rung 1's `outofband` test returns a
JS challenge, don't bother re-testing — jump to the `browserbase` rung.)

### B2. Locate the source's config

The `name` is the source name. Find its config file:

- **External calendar:** `sources/external/<name>.yaml`
- **Ripper:** `sources/<name>/ripper.yaml`

If both exist with the same bare name (rare), the `rung` and the source's
`proxy:` field disambiguate.

### B3a. `promote-to-browserbase` — climb a rung

The `outofband` rung failed 3 times in a row. Open **one PR** batching all
`promote-to-browserbase` sources together. Change each source's `proxy` field
from `outofband` to `browserbase`:

```yaml
# sources/external/<name>.yaml
  proxy: browserbase   # was: outofband
```

Browserbase executes JavaScript and follows redirects, bypassing bot detection
(e.g. SiteGround sgcaptcha) that blocks even residential IPs. Browserbase
sources are fetched **live in the main CI build**, not by the out-of-band runner
— so the rung change moves where the source is fetched. The counter resets to 0
on the rung change (a fresh rung earns its own 3 strikes).

PR title: `chore(proxy): escalate N sources outofband → browserbase` (or name
them if only 1-2). In the body, list each source with its consecutive failure
count and `lastError`.

If a source has a candidate doc under `docs/source-candidates/<slug>.md`,
add a dated note recording the escalation.

### B3b. `retire` — top of the ladder exhausted

`browserbase` (the highest rung) failed 3 times in a row (with errors that are
**not** HTTP 402 — see the billing check above). There is nowhere higher to
climb, so retire the source. Open **one PR** batching all `retire` sources
together. For each source:

1. Sets `disabled: true` in the source's YAML config.
2. Flips `docs/source-candidates/<slug>.md` frontmatter to `status: blocked` and
   appends a dated note recording the full ladder history, e.g.:

   > Re-probed YYYY-MM-DD: proxy ladder exhausted. Direct fetch 403s from CI;
   > outofband (residential IP) 403s; browserbase 3× `<lastError>`. Disabled and
   > marked blocked. The daily discovery cron will not re-propose it.

PR title: `chore(proxy): retire N sources — proxy ladder exhausted` (or list
names if only 1-2).

**Leave a `retire` PR for human merge** — retiring a source is a "we give up on
this source" decision, not a routine fix. Convert to ready-for-review, post a
brief comment explaining the ladder history, and stop. Do **not** enable
auto-merge.

### B4. PR hygiene (per AGENTS.md)

For each PR:
1. Branch off latest `origin/main` (rebase before pushing).
2. Open the PR (draft by default is fine).
3. Subscribe: `mcp__github__subscribe_pr_activity`.
4. Post the `/q review` re-review template (see AGENTS.md).
5. Address Q feedback, resolve threads.
6. **Promotion PRs** (`promote-to-browserbase`) are broken-source repairs —
   auto-merge-eligible once green. **Retirement PRs** (`retire`) are **not** —
   convert to ready and leave for human merge.

Batch sources with the same recommendation into one PR — sources identified
together in the same build report belong together in one commit, making bulk
reverts easy and keeping the changelog clean. Only split into multiple PRs if
the sources have meaningfully different contexts (e.g., different error types).

## Reply

Summarize both modes:

```
🪜 Proxy escalation:
  Mode A (staged PRs):
    - jazz-alley: verified at outofband (42 events) — merged PR #NNN
    - some-blocked-venue: ladder exhausted (outofband 403, browserbase sgcaptcha) — closed PR #NNN, marked blocked
    - other-venue: browserbase untested (Browserbase credits exhausted) — left open, will retry
  Mode B (live queue):
    - el-centro-de-la-raza: outofband → browserbase (3 fails, HTTP 403) — PR #NNN
    - some-dead-feed: retired (browserbase exhausted) — PR #NNN (awaiting human merge)
```

If nothing was actionable, say so:

```
🪜 Proxy escalation: 0 staged PRs; N queue entries all within the 3-failure
   budget — no action.
```
