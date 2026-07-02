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

### 3. Run Out-of-Band Generation

```bash
cd /root/.openclaw/workspace-calendar/repo && \
  OUTOFBAND_BUCKET=calendar-ripper-outofband-220483515252 \
  AWS_DEFAULT_REGION=us-west-2 \
  npm run generate-outofband 2>&1
```

### 4. Reply with Summary

From the output, extract and report:
- How many sources ran
- Total events uploaded to S3
- Any errors encountered

### 5. Error Handling Decision Tree

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
- Note: this source needs `proxy: true` added to its `ripper.yaml`
- Do NOT disable the ripper

#### ❌ Only Disable if Source is Clearly Gone
Disable a ripper only if:
- Consistent 404 across multiple runs
- Source site explicitly says they no longer publish
- Source is permanently blocked

**Default: keep rippers running.**