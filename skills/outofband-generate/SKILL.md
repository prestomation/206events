---
name: outofband-generate
description: Run the out-of-band 206.events generate job. Pulls latest code, installs deps, runs generate-outofband against the S3 bucket, and posts a summary. Auto-fixes broken rippers by spawning subagents. Use when triggered by the 11 PM UTC daily cron or when asked to run the out-of-band calendar generation.
---

# 206.events Out-of-Band Generate

Run the out-of-band calendar generation job and upload results to S3.

## Steps

### 1. Pull Latest Code

```bash
cd /root/.openclaw/workspace-calendar/repo && git pull origin main
```

### 2. Install Dependencies

```bash
cd /root/.openclaw/workspace-calendar/repo && npm install --prefer-offline 2>&1 | tail -3
```

### 3. Drain staged proxy PRs first (proxy escalation)

**Before generating anything, run `skills/proxy-escalation/SKILL.md`.** This is
the only environment where the proxy fetch paths (`outofband` = plain fetch from
this residential IP; `browserbase`) actually work, so proving and merging
proxy-dependent sources belongs here — not in the CI-side build-report skill.

Read `skills/proxy-escalation/SKILL.md` and follow it end to end:

- **Mode A** — find open PRs labelled `requires-proxy-testing`, check each out,
  test the ladder locally, and **merge** the PR at the lowest working rung or
  **close** it if no rung works (browserbase-credit exhaustion ≠ failure — leave
  those open). Newly-merged sources land on `main`.
- **Mode B** — act on the `pendingProxyVerification` queue for already-live
  sources that have degraded.

Then re-sync `main` so the just-merged sources are included in this run:

```bash
cd /root/.openclaw/workspace-calendar/repo && git checkout main && git pull origin main
```

### 4. Run Out-of-Band Generation

```bash
cd /root/.openclaw/workspace-calendar/repo && \
  OUTOFBAND_BUCKET=calendar-ripper-outofband-220483515252 \
  AWS_DEFAULT_REGION=us-west-2 \
  npm run generate-outofband 2>&1
```

### 5. Reply with Summary

From the output, extract and report:
- How many sources ran
- Total events uploaded to S3
- Any errors encountered

### 6. Error Handling Decision Tree

For each error, apply this logic:

#### 🔧 Fix It (spawn subagent)
If a **previously-working ripper** now errors because the source site changed (new HTML structure, new date format, new API shape, new data variants):
- Fetch the live URL to see what it currently returns
- Understand the new structure
- Spawn a subagent to fix the parser:
  ```
  sessions_spawn(runtime="acp", agentId="claude",
    cwd="/root/.openclaw/workspace-calendar/repo",
    task="Fix the <ripper-name> ripper in 206.events. The source at <URL> has changed. Current error: <error>. Fetch the URL, understand the new structure, update the parser. Commit and push directly to main.")
  ```
- The subagent commits and pushes directly to main.

#### ⚠️ Fix Obvious Parsing Errors
If specific events fail to parse due to an obvious bug in the ripper code (e.g., unhandled time format, missing case in a parser):
- Fix the parser code directly in the repo
- Commit and push to main on a feature branch, then open a PR
- Examples: multi-session times (`"11:30 am, 1:30 pm"`), new date format, missing regex case
- The fix should handle the new format gracefully (e.g., use first time for multi-session, add new regex pattern)

#### 🤷 Skip Non-Obvious or Structural Errors
If only specific events fail and the cause isn't an obvious parser bug:
- Note the issue with a warning
- Don't disable the ripper — let it skip bad items

#### ⏭️ Transient Errors
If the error looks transient (network timeout, temporary 5xx):
- Do nothing, it'll resolve on its own

#### 🚫 HTTP 403 from Runner IPs
If a source returns 403 specifically for this runner's IPs:
- Flag it in the report
- This is a **proxy-ladder** matter, handled by `skills/proxy-escalation/SKILL.md`
  (step 3), not by hand-editing YAML here. If it's an existing `outofband` source
  now failing, it will surface in the `pendingProxyVerification` queue and climb
  after 3 consecutive failures (Mode B). Do not add a raw `proxy: true` — the
  schema only accepts `"outofband"`, `"browserbase"`, or `false`.
- Do NOT disable the ripper

#### ❌ Only Disable if Source is Clearly Gone
Disable a ripper only if:
- Consistent 404 across multiple runs
- Source site explicitly says they no longer publish
- Source is permanently blocked

**Default: keep rippers running.**