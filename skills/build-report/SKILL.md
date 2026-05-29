# 206.events Build Report

Fetch and analyze the 206.events build health report, fix broken rippers, and post a summary.

## Steps

### 1. Fetch Build Errors

Run the build health script:

```bash
python3 skills/build-report/scripts/build-health.py
```

This fetches `https://206.events/build-errors.json` and prints a structured summary including:
- Total error count
- Config errors, external failures, zero-event calendars
- expectedEmpty cross-check (flags calendars marked empty that now have events)
- Geo coverage stats and geocode errors
- Build timestamp

### 2. Reply with Build Health Report

Include the report in your reply text — the delivery system will route it to the correct channel.

### 3. Error Handling Decision Tree

For each error, apply this logic:

#### 🔧 Fix It
If a **previously-working ripper** now errors because the source site changed (new HTML structure, new date format, new API shape, new data variants):
- Fetch the live URL to see what it currently returns
- Understand the new structure
- Delegate a fix to a coding agent on a feature branch
- The fix must go through a PR — never commit directly to main
- After any review comment on the fix PR is addressed (fix pushed or clear reply posted explaining why no action will be taken), resolve the review thread using `mcp__github__resolve_review_thread`

#### ⚠️ Report Skipped Items (ParseErrors)
If a source reports `ParseError` entries alongside successful events (e.g., "8 events, 2 errors"), these indicate items the parser couldn't handle. **This is not a build failure** — the source is working — but the skipped items should be investigated:
- If the item legitimately has no date or isn't really an event, no action needed
- If the item has a date in a new format the regex doesn't handle, delegate a parser fix to a coding agent
- Include a summary in the report: `⏭️ ParseErrors: source-name: 2 items skipped — "Event Title 1" (no date), "Event Title 2" (unparseable format)`

Do not disable the ripper for ParseErrors — they're working as intended (graceful failure + visibility).

#### ⏭️ Transient Errors
If the error looks transient (network timeout, temporary 5xx):
- Do nothing, it'll resolve on its own

#### 🚫 HTTP 403 / Persistent Fetch Failures
If a source returns 403 or consistently fails to fetch, follow the proxy escalation ladder:

| Rung | Config | When |
|------|--------|------|
| 1 | `proxy: false` (default) | Source works from GitHub Actions |
| 2 | `proxy: "outofband"` | Source works from home IP but CI 403s it |
| 3 | `proxy: "browserbase"` | JS challenge (e.g. SiteGround sgcaptcha) blocks even residential IP |

**Escalation is one rung at a time, one PR at a time:**
1. **No proxy yet and CI 403s it?** → Add `proxy: "outofband"` in a PR. The out-of-band runner fetches from a residential IP.
2. **Already `proxy: outofband` and still failing?** → Escalate to `proxy: "browserbase"` in a follow-up PR. Browserbase executes JS to bypass bot detection.
3. **Already `proxy: browserbase` and still failing?** → Flag in the report for human review. The source may need a custom ripper or alternative URL.

**Never skip escalation steps.** Each step requires its own PR so the failure is observable.

- After 10+ consecutive failures, escalate to the next rung
- Do NOT disable the ripper without human approval

#### ❌ Only Disable if Source is Clearly Gone
Disable a ripper only if:
- Consistent 404 across multiple builds
- Source site explicitly says they no longer publish
- Source is permanently blocked

**Default: keep rippers running.**

### 4. Geo Error Check

Check the geocode errors from the build health output.

**If no errors:**
```
🗺️ Geo coverage: N/M events (X%) — no geocode errors ✅
```

**If errors exist:**
Read `skills/geo-resolver/SKILL.md` and follow it completely to resolve the geocode errors.

After the geo resolver completes, include a geo fix summary in your reply including:
- How many errors were resolved vs. remain unresolvable
- For data-only fixes (KNOWN_VENUE_COORDS entries, lookup table additions): link the commit pushed direct to main
- For logic fixes: link the PR
- Updated geo coverage % after fixes

**After any code fixes** (geocoder or ripper changes), re-trigger a build and re-fetch `build-errors.json` to verify the errors are gone. Include the before/after error counts in your reply.

Note: data-only geo fixes (known venues, lookup entries) are pushed direct to main — no PR needed. Logic changes still require a PR.

### 5. Event Uncertainty Check

Check `uncertaintyStats` and `uncertainEvents` in the build health output.

**If no outstanding uncertain events:**
```
❓ Event uncertainty: 0 outstanding ✅
```

Even when nothing is outstanding, run the prune step from
`skills/event-uncertainty-resolver/SKILL.md` (step 5) so stale cache
entries don't accumulate between resolver invocations. A single
dry-run + apply pass is enough.

**If outstanding entries exist:**
Read `skills/event-uncertainty-resolver/SKILL.md` and follow it completely to resolve the outstanding uncertainty entries. The pruning step (5) runs as part of that workflow.

After the event-uncertainty-resolver completes, include a uncertainty fix summary in your reply:
- How many resolved vs. how many marked unresolvable
- How many cache entries pruned (and by what reason)
- Cumulative cache size after the run

These are not build failures — they are todos for an LLM to investigate. The
`totalErrors` count includes them; the resolver's job is to drain that queue
across builds.

### 6. Source Discovery (if no actionable errors)

If there are **no actionable errors** (0 config errors, 0 external failures, all geocode errors are virtual/TBA/unresolvable, 0 outstanding uncertain events), read `skills/source-discovery/SKILL.md` and follow it completely.