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
- Photo coverage stats and missing-photo gaps
- `urlEntityErrors` — URL fields containing HTML entities (`&amp;`, `&#38;`, …). **Fatal** — see below
- Build timestamp

**If the script returns HTTP 403**, the sandbox IP was blocked despite the
proxy. Try `curl` directly (uses the same proxy and CA bundle):

```bash
curl -sS --cacert /root/.ccr/ca-bundle.crt "https://206.events/build-errors.json" | python3 -m json.tool
```

If that also fails, fall back to downloading from the GitHub Actions artifact:
1. Use `mcp__github__actions_list` to find the latest `build-calendars.yml` run.
2. Use `mcp__github__actions_get` or list artifacts to find the `build-errors`
   artifact ID for that run.
3. Download the artifact zip via the GitHub API, extract `build-errors.json`,
   and parse it manually.

### 2. Reply with Build Health Report

Include the report in your reply text — the delivery system will route it to the correct channel.

### 3. Error Handling Decision Tree

For each error, apply this logic:

#### 🔧 Fix It
If a **previously-working ripper** now errors because the source site changed (new HTML structure, new date format, new API shape, new data variants):
- Fetch the live URL to see what it currently returns
- Understand the new structure
- Delegate a fix to a coding agent on a feature branch
- **When fixing or iterating on a single source, build only that source — never a full all-sources build:**

  ```sh
  ONLY_SOURCE=<source-name> npm run generate-calendars
  ```

  `ONLY_SOURCE` restricts the build to the broken source (skipping every other source's fetch+parse and the new-source/deployed-site gates), so iteration is fast and outgoing traffic stays scoped to the one source. The fetch cache (`docs/fetch-cache.md`) fetches it live only once; re-runs re-parse the cached body with no network, so you can iterate on the parser fix freely.
- The fix must go through a PR — never commit directly to main
- After any review comment on the fix PR is addressed (fix pushed or clear reply posted explaining why no action will be taken), resolve the review thread using `mcp__github__resolve_review_thread`

#### ⚠️ Report Skipped Items (ParseErrors)
If a source reports `ParseError` entries alongside successful events (e.g., "8 events, 2 errors"), these indicate items the parser couldn't handle. **This is not a build failure** — the source is working — but the skipped items should be investigated:
- If the item legitimately has no date or isn't really an event, no action needed
- If the item has a date in a new format the regex doesn't handle, delegate a parser fix to a coding agent
- Include a summary in the report: `⏭️ ParseErrors: source-name: 2 items skipped — "Event Title 1" (no date), "Event Title 2" (unparseable format)`

Do not disable the ripper for ParseErrors — they're working as intended (graceful failure + visibility).

#### 🔗 URL Entity Errors (FATAL)
If `urlEntityErrors` is non-empty, a URL field (`url`, `friendlyLink`, `icsUrl`, `infoUrl`, `imageUrl`, or a runtime `event.url` / `event.imageUrl`) contains an HTML entity such as `&amp;`, `&#38;`, or `&quot;`. `new URL()` accepts these verbatim, so they would ship as broken links — the build **fails** on them (counted in `fatalErrorCount`). Each entry names the `scope`, `source`, `field`, the offending `value`, and the `entities` found. **Fix at the source:**
- **Ripper-produced (`scope: "event"`)** — the ripper extracted the URL from HTML without decoding. Decode it at extraction with `decode()` from `html-entities` before assigning to `event.url` / `event.imageUrl`. Delegate the ripper fix to a coding agent on a feature branch.
- **Hand-authored (`scope: "ripper" | "external" | "recurring"`)** — a YAML config has a literal entity. Replace it with the literal character (`&`, not `&amp;`) in the source `.yaml`.

See `docs/url-entities.md`. This is never a "report and move on" item — it must be fixed before the build can go green.

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

**Don't prove or merge a proxy change from build-report.** build-report runs in
CI, where the `outofband`/`browserbase` fetch paths can't be exercised — so
testing and merging a proxy fix belongs to the out-of-band run, not here. Never
hand-pick a final rung and merge it.

1. **A `proxy: false` source that now 403s in CI** → **stage it, don't fix it
   here.** Open a PR that adds `proxy: "outofband"` (the ladder entry point) and
   label it `requires-proxy-testing` (`mcp__github__issue_write` `method: update`
   `labels: ["requires-proxy-testing"]`); leave it **open and unmerged**.
   `skills/proxy-escalation/SKILL.md` (out-of-band job, Mode A) tests the ladder
   from the residential environment and merges the working rung — climbing to
   `browserbase` if `outofband` also fails — or closes the PR if none work. Note
   any JS-challenge evidence (`window.location.reload()`, `sgcaptcha`, Cloudflare)
   in the PR body so Mode A skips straight to `browserbase`.
2. **A source that ALREADY carries a proxy (`outofband`/`browserbase`) and is
   failing** → do nothing here. It's tracked in the `pendingProxyVerification`
   queue (step 5.5); the out-of-band run escalates it after 3 consecutive failures
   and retires it after browserbase fails 3 times. Your job is to *report* the
   queue, not act on it.

- Do NOT disable the ripper without human approval (the proxy-escalation skill handles browserbase-exhausted retirement automatically)

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

### 5.5. Proxy Verification Check

Check `pendingProxyVerification` in the build health output. This is the queue
of sources that need a proxy to be fetched at all, still climbing the
`outofband → browserbase → disabled` ladder. It is **non-fatal** — a brand-new
proxy source can't be proven in CI, so it's tracked here instead of failing the
build.

**If the queue is empty:**
```
🪜 Proxy verification: 0 pending ✅
```

**If entries exist**, report each with its `rung`, `consecutiveFailures`, and
`recommendation`. **Report only — do not run proxy-escalation from here.**
build-report runs in the CI-style environment, where the `outofband` and
`browserbase` fetch paths can't be exercised, so it can't verify or escalate
anything. Proxy escalation (both the `requires-proxy-testing` staged-PR queue and
this `pendingProxyVerification` queue) is drained by
`skills/proxy-escalation/SKILL.md` **inside the out-of-band generate job**
(`skills/outofband-generate/SKILL.md`), which runs from the residential
environment where those paths work. Entries with recommendation `verifying` are
still within the 3-failure budget. Just surface the queue so it's visible:

```
🪜 Proxy verification: N pending — M ready to escalate (handled by the out-of-band run)
  - <source> (<rung>, <consecutiveFailures> fails) → <recommendation>
```

### 5.55. Stale-Serve Check

Check `proxyStaleServes` in the build health output. Each entry is a source
whose **live fetch failed this build** and was satisfied from a cached copy
older than the TTL (so events weren't lost, but the source is not actually
being refreshed). These **count toward `totalErrors`** — a persistent stale
serve means the source (or, for a browserbase source, Browserbase itself) is
broken. See `docs/fetch-cache.md`.

**If the list is empty:**
```
🕒 Browserbase stale serves: 0 ✅
```

**If entries exist**, report each with its `source` (or `url`), `ageHours`, and
`error`. A single transient blip clears itself on the next build; a source that
keeps serving stale needs investigation — verify the source URL still works. If
Browserbase can no longer fetch it, **flag it for retirement but don't act here**:
retiring a browserbase source (disable + candidate doc `status: blocked`) is a
proxy-ladder action handled by `skills/proxy-escalation/SKILL.md` in the
out-of-band run, since browserbase is the last proxy rung.

```
🕒 Browserbase stale serves: N
  - <source> (~<ageHours>h old) — <error>
```

### 5.6. Photo Coverage Check

Check `photoStats` and `photoGaps` in the build health output.

**If nothing is missing:**
```
🖼️ Photo coverage: N/M events, V/W venues — no missing photos ✅
```

**If there are gaps:**
Read `skills/photo-resolver/SKILL.md` and follow it to backfill photos. It
processes a bounded batch per run: venue gaps become `imageUrl:` PRs against the
source YAML, event gaps become `--image-url` resolutions written to the
event-uncertainty-cache (or `unresolvable` when no photo exists).

These are not build failures — like geo and uncertainty, they're a todo queue
the resolver drains across builds, and it self-limits as photos and
`unresolvable` markings accrue.

### 5.7. Cost Coverage Check

Check `costStats` and `costGaps` in the build health output.

**If nothing is missing:**
```
💲 Cost coverage: N/M events (F free, S sold out) — no missing costs ✅
```

`soldOutEvents` (events whose `cost` is `{ soldOut: true }`) is informational,
not a gap — sold-out shows are fully resolved, not a todo.

**If there are gaps:**
Read `skills/cost-resolver/SKILL.md` and follow it to backfill event costs. It
processes a bounded batch per run: source-wide free venues become `cost: free`
PRs against the source YAML, per-event gaps become `--cost-*` resolutions
written to the event-uncertainty-cache (or `unresolvable` when pricing is
genuinely not published).

Same lifecycle as photos: not build failures, a self-limiting todo queue.

### 5.8. Cross-source Duplicate Check

Check `duplicateStats` and `duplicateCandidates` in the build health output.
HIGH-confidence cross-source duplicates are merged automatically at build time
(collapsed into one card with attribution); the queue here is the MED-confidence
candidates awaiting a confirm/reject.

**If nothing is pending:**
```
🔀 Cross-source duplicates: N merged, 0 candidates pending ✅
```

**If there are candidates:**
Read `skills/duplicate-resolver/SKILL.md` and follow it to confirm or reject the
candidate pairs. Confirmations and rejections are written to
`event-duplicate-cache.json` (keyed by the candidate `key`), which the next
build reads to merge confirmed pairs and keep rejected pairs separate.

Same lifecycle as photos/costs: not build failures, a self-limiting todo queue
the resolver drains across builds.

### 6. Source Discovery (if no actionable errors)

If there are **no actionable errors** (0 config errors, 0 external failures, all geocode errors are virtual/TBA/unresolvable, 0 outstanding uncertain events), read `skills/source-discovery/SKILL.md` and follow it completely.