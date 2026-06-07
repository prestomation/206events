# 206.events Proxy Escalation

Drive proxy-marked calendar sources up the fetch-proxy escalation ladder
(`outofband → browserbase → disabled`) based on the automated
`pendingProxyVerification` queue. One escalation per PR.

## Why this skill exists

A source that 403s from GitHub Actions IPs gets added with `proxy: "outofband"`
on the belief a residential IP can reach it — but that belief can't be proven in
the PR build (the out-of-band runner hasn't fetched it yet) and might be wrong
(e.g. a SiteGround JS captcha blocks even residential IPs). The build no longer
fails for these unproven sources: they're exempted from the fatal "new source
produced 0 events" gate and tracked in a non-fatal queue instead.

The out-of-band cron runner (`scripts/generate-outofband.ts`) is the sole writer
of `proxy-verification.json` in S3. Each run it records whether every proxy
source was reachable this run — `outofband` sources from its own residential
fetch, `browserbase` sources from the published `build-errors.json` — and
maintains a per-source consecutive-failure counter. After **3 consecutive
failures** at a rung, a source is due to climb. **This skill is the actuator**
that reads the queue and opens the escalation PRs. The runner counts; the skill
acts.

See `docs/proxy-verification.md` for the full design and `docs/outofband.md` for
the out-of-band architecture.

## When to run

- The **build-report skill** (step 5.5) directs you here when
  `pendingProxyVerification` contains entries recommending
  `promote-to-browserbase` or `retire`.
- The post-build Discord notification nudges "run proxy-escalation" when the
  published `build-errors.json` shows actionable proxy entries.

If every pending entry is `verifying` (still within the 3-failure budget), there
is **nothing to do** — report and stop.

## Steps

### 1. Read the queue

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

Stop the skill here — do not proceed to steps 3a/3b for 402 entries.

### 2. Locate the source's config

The `name` is the source name. Find its config file:

- **External calendar:** `sources/external/<name>.yaml`
- **Ripper:** `sources/<name>/ripper.yaml`

If both exist with the same bare name (rare), the `rung` and the source's
`proxy:` field disambiguate.

### 3a. `promote-to-browserbase` — climb a rung

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

### 3b. `retire` — top of the ladder exhausted

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

### 4. PR hygiene (per AGENTS.md)

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

### 5. Reply

Summarize what you escalated:

```
🪜 Proxy escalation:
  - el-centro-de-la-raza: outofband → browserbase (3 fails, HTTP 403) — PR #NNN
  - some-dead-feed: retired (browserbase exhausted) — PR #NNN (awaiting human merge)
```

If nothing was actionable, say so:

```
🪜 Proxy escalation: N pending, all within the 3-failure budget — no action.
```
