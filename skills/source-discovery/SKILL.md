# 206.events Source Discovery

Find and add new Seattle event sources to 206.events. Runs after the daily build report when there are no actionable errors to fix.

## When to run

This skill is triggered by the build report skill (`skills/build-report/SKILL.md`, step 5) when the build is healthy — 0 config errors, 0 external failures, all geocode errors are virtual/TBA/unresolvable. The build report skill will direct you here.

## Steps

### 1. Read existing candidates

Per-candidate triage data lives one-file-per-candidate under
`docs/source-candidates/`. See `docs/source-candidates/README.md` for the
file layout and frontmatter schema. To check what's been evaluated, list
the directory and skim filenames; for status detail, read the file's
frontmatter (`status:` field).

The chronological discovery log lives in **`docs/discovery-log/`** —
one file per day, named `YYYY-MM-DD.md`. To see recent runs, list that
directory sorted by name. When you add or update a candidate, write to
`docs/source-candidates/<slug>.md`; when you record your day's findings,
create/update `docs/discovery-log/YYYY-MM-DD.md`.

### 2. Check for dead sources

Before searching for new sources, check existing sources for signs of death:

```bash
python3 skills/source-discovery/scripts/dead-sources.py
```

For any source with **0 events for 30+ consecutive days** or returning **404/410 consistently**, flag it: write or update its file in `docs/source-candidates/<slug>.md` with `status: dead` in the frontmatter and a note describing the symptom. Do NOT disable it — just flag it for human review.

### 3. Search for new sources

Run 3-5 web searches using varied queries. **Rotate the focus daily** to avoid re-finding the same sources. Pick from these verticals in rotation:

- **Music venues**: `"Seattle live music venue calendar"`, `"Seattle concert calendar"`, `"Capitol Hill music events"`, `"Ballard live music"`
- **Arts & culture**: `"Seattle art gallery events calendar"`, `"Seattle museum events"`, `"Seattle theater calendar"`
- **Community**: `"Seattle community center events calendar"`, `"Seattle neighborhood events"`, `"Seattle block party"`
- **Food & drink**: `"Seattle food festival"`, `"Seattle beer release calendar"`, `"Seattle restaurant events"`
- **Comedy & nightlife**: `"Seattle comedy club calendar"`, `"Seattle open mic calendar"`, `"Seattle trivia night schedule"`
- **Outdoors & sports**: `"Seattle outdoor events calendar"`, `"Seattle running events"`, `"Seattle farmers market schedule"`
- **Bookstores & libraries**: `"Seattle bookstore events calendar"`, `"Seattle author reading"`
- **Festivals & seasonal**: `"Seattle festival"`, `"Seattle summer events calendar"`, `"Seattle holiday market"`

Also try discovery-oriented searches:
- `"site:seattle.gov calendar events"` — city events
- `"site:eventbrite.com Seattle events organizer"` — Eventbrite sources
- `"Seattle events ICS subscribe calendar"` — ICS feeds
- `"Seattle events RSS feed"` — RSS/ICS sources
- `"new Seattle venue events"` — recently opened venues

### 4. Quality gate each candidate

For each search result that looks like a Seattle event source, evaluate:

1. **Seattle-area?** Must be **Seattle-focused** — primarily serving Seattle audiences. Venues with a few events in nearby cities (Bellevue, Kirkland, etc.) are OK as long as most events are in Seattle proper.
2. **Has a public events page or feed?** Must have a URL with event listings
3. **Matches a known ripper type?** Must be one of:
   - ICS/iCal feed (add a file to `sources/external/<name>.yaml`)
   - Squarespace (built-in `squarespace` type — verify `?format=json` returns future events: fetch the URL and check that at least one event in `data.upcoming`, `data.past`, or `data.items` has `startDate > Date.now()` in milliseconds; do NOT rely on reading event description text for dates — verify the raw epoch timestamp values)
   - Eventbrite (built-in `eventbrite` type — needs `organizerId`)
   - Ticketmaster (built-in `ticketmaster` type)
   - DICE (built-in `dice` type)
   - AXS (built-in `axs` type)
   - Shopify (built-in `shopify` type — verify `/products.json` returns events)
   - Custom HTML/JSON scraping (the repo has many custom rippers — this is viable, not "not viable")
4. **Not already covered?** Check `sources/` directory and `sources/external/`
5. **Not already in candidates?** Check `docs/source-candidates/` — `ls` the directory and look for the slug.
6. **Sufficient event volume?** Should have at least a few events, not a one-off
7. **Not a religious source?** Do not add sources that are primarily religious organizations (churches, synagogues, mosques, religious federations, etc.). Secular community organizations (Urban League, NAACP, etc.) are fine. Cultural events hosted at religious venues are OK if the organization itself is secular.

### 5. Update candidate files and push to main

For each source evaluated, write or update its per-candidate file in
`docs/source-candidates/<slug>.md`. The frontmatter `status:` field is
the source of truth — update it as the candidate's situation changes:

- **New candidate found**: Create the file with `status: candidate`, set
  `firstSeen` and `lastChecked`, and write notes (URL, platform, tags,
  investigation findings) in the body.
- **Source implemented**: Flip `status: added` and add the PR number to
  the frontmatter (`pr: 271`). Bump `lastChecked`.
- **Source not viable**: Flip `status: notviable` and write the reason
  ("no public calendar", "not Seattle", "platform requires browser").
- **Source blocked**: Flip `status: blocked` with the reason
  ("Cloudflare bot protection", "needs paid API key").
- **Source needs a proxy**: `status: proxy` — the pipeline works locally but CI
  blocks it, so it's **staged** as an open, unmerged `requires-proxy-testing` PR
  (step 7a). Note the PR number and the CI evidence of the block. You do **not**
  pick a rung — `skills/proxy-escalation/SKILL.md` proves `outofband` vs
  `browserbase` from the out-of-band environment and merges the working one (or
  closes the PR if neither works, flipping this to `status: blocked`).

Each candidate is one file, so two PRs touching different candidates
never conflict on this directory.

After updating the per-candidate files, create a new day-log file at
**`docs/discovery-log/YYYY-MM-DD.md`** with your findings:

```markdown
## Source discovery: <verticals>

- ✅ Added: [venue name] — [ripper type] — PR #XXX
- 💡 Candidate: [venue name] — [ripper type] — [URL]
- ❌ Not Viable: [venue name] — [reason]
- 🔄 Status fix: [venue name] — [what changed]
- 🔍 Investigating: [venue name] — [what's being looked at]
```

One file per day — two PRs running discovery on different days never conflict
here because they create different files. See `docs/discovery-log/README.md`
for the full format. If you run discovery twice on the same calendar day,
append a second `## Source discovery:` section to the existing file rather
than creating a duplicate.

**Then commit and open a PR.** Even though this is reference data (not code), the repo requires all changes via PR. Use a branch like `chore/source-discovery-YYYY-MM-DD`. After CI passes and Amazon Q has no blocking comments, merge the PR. This ensures candidates are always up-to-date before we start implementing.

### 6. Implement the highest-confidence source

From the 💡 Candidate list, **always pick the source with the highest confidence**. Confidence tiers:

| Tier | Criteria | Examples |
|------|----------|---------|
| 🔥 **High** | Built-in type with **confirmed working API** — you've verified it returns data | Eventbrite with verified organizerId, Squarespace with confirmed `itemCount > 0`, ICS feed returning valid VCALENDAR, Shopify with confirmed `/products.json` |
| 🟡 **Medium** | Built-in type that *should* work but **unverified** | Eventbrite with untested org ID, WordPress/Tribe Events ICS endpoint, DICE venue ID |
| 🔴 **Low** | Requires **custom scraper code** | HTML table scraping, WordPress with custom REST endpoints |

**Only implement one source per cycle.** Pick the highest-confidence 💡 candidate that hasn't been attempted. If multiple have the same tier, pick the one with the most expected events.

**🔴 Low does not mean "not viable".** The repo has many custom scrapers (frye_art_museum, royal_room, cobys_cafe, seatoday, etc.). A 🔴 Low source is still worth implementing — it just takes more work and should be prioritized after higher-tier candidates. Only mark a source `❌ Not Viable` if it truly can't be scraped (no structured data at all, JS-rendered with no API, requires browser automation we don't have).

To implement:
1. **Cut a feature branch**: `scripts/new_feature_branch.sh`
2. **Pre-implementation fetch validation** — Before writing a line of parser code, attempt a live fetch of the source URL:
   ```bash
   curl -sI -A "Mozilla/5.0 (compatible; 206events/1.0)" "<source-url>"
   ```
   Then act based on the response:

   | Response | Meaning | Action |
   |---|---|---|
   | **200 + events found** | Source works | Proceed with implementation |
   | **200 + 0 events** | Source exists but is empty | Do not implement. Keep in `💡 Candidate` with a note that it was empty at time of check; re-evaluate next cycle |
   | **404 / 410 / DNS failure** | Our URL was wrong or the source has moved | Do not implement yet. Update the candidate entry to `🔍 Investigating` and search for the correct URL. Only mark `❌ Not Viable` once no working URL can be found. |
   | **403 / 429 / connection reset** | Blocked — but by what? | See below |

   **Proxy escalation ladder:** When a source works locally but CI blocks it, do
   **not** pick a proxy rung and merge. Which rung works can only be proven in the
   out-of-band (residential) environment, so leave that to the proxy-escalation
   skill. Your job is to **stage** the PR, not to prove or merge the proxy.

   | Rung | Config | When |
   |------|--------|------|
   | 1 | `proxy: false` (default) | Source works from GitHub Actions |
   | 2 | `proxy: "outofband"` | Works from a residential IP but CI 403s it |
   | 3 | `proxy: "browserbase"` | JS challenge (e.g. SiteGround sgcaptcha) blocks even residential IP |

   **Workflow:**
   - **Fetch succeeds locally (200 + data)** → implement with `proxy: false`, push
     the PR, let CI run.
   - **CI fetches it successfully (events > 0)** → merge as normal. No proxy
     needed (rung 1); done.
   - **CI blocks it (403 / captcha / 0 events caused by a block)** → the source
     needs a proxy. **Do NOT add a proxy rung, and do NOT merge.** Leave the PR
     open at `proxy: false` and **stage it for proxy testing** (see step 7a):
     apply the `requires-proxy-testing` label, set the candidate `status: proxy`,
     and stop. `skills/proxy-escalation/SKILL.md` — run inside the out-of-band
     job, the one environment where the proxy fetch paths work — checks the PR
     out, tests `outofband` then `browserbase` locally, and **merges the lowest
     working rung** or **closes** the PR if none work. You never hand-pick a rung.
   - **Fetch fails locally too (403 / CAPTCHA / connection reset / non-200)** → do
     NOT implement and do NOT stage. A source you can't reach from anywhere has
     nothing to prove — record what you observed in
     `docs/source-candidates/<slug>.md` with `status: blocked` or
     `status: candidate`, and move on.

   **Do not guess at the data shape** if you cannot fetch the source. An implementation written against an inaccessible URL is a guess — it will produce 0 events or parse errors. Only implement once you have seen a real sample response.

3. **Spawn a coding agent**: `sessions_spawn(runtime="acp", agentId="claude", cwd=<repo_path>)` with the full implementation spec including ripper type, URL, config details, geo coordinates, tags, and (if applicable) `proxy: "outofband"` requirement

   **When implementing/iterating, build only the new source — never a full all-sources build:**

   ```sh
   ONLY_SOURCE=<source-name> npm run generate-calendars
   ```

   `ONLY_SOURCE` restricts the build to that one source (skipping every other source's fetch+parse and the new-source/deployed-site gates), so iteration is fast and outgoing traffic stays scoped to the source being added. The fetch cache (`docs/fetch-cache.md`) fetches it live only once; re-runs re-parse the cached body with no network, so you can iterate on parsing freely.
4. **Push and open PR**: `scripts/push_and_pr.sh`

#### 6a. Sources that need a credential (API key / token / secret)

Some sources require an API key, token, or other credential to fetch (Algolia
search keys, Supabase anon keys, Sitecore read keys, etc.). Even when that
credential is "public" (served in the site's own client-side JS and gated to
read-only access), **never hardcode it in a ripper or commit it in a fixture** —
committed keys trip secret scanners and create noise for the key's owner. The
repo enforces this with gitleaks (CI + pre-commit); a hardcoded key will fail
the build. Instead:

1. **Read it from the environment.** Use `process.env.<SOURCE>_<NAME>` (e.g.
   `CANDLELIGHT_ALGOLIA_API_KEY`). Mirror the guard in
   `lib/config/ticketmaster.ts`: if the env var is missing, return the
   calendars with a per-calendar `ParseError` ("…environment variable is not
   set") and zero events — **do not throw**, and do not fall back to a
   hardcoded literal.
2. **Wire it up.** Add a placeholder line to `.env.example` (empty value + a
   comment on where the value comes from) and add the secret reference to the
   `Generate calendars` step's `env:` block in
   `.github/workflows/build-calendars.yml`
   (`<NAME>: ${{ secrets.<NAME> }}`).
3. **Assume the secret is NOT set yet** — it has to be added to GitHub by
   Preston. The source will report zero events in CI until then, so call this
   out loudly in **both**:
   - the **PR body** — a line like
     `⚠️ Action required: add repo secret \`<NAME>\` (Settings → Secrets and variables → Actions) before merging, or this source will report zero events.`
   - the **chat report** — repeat the same "you need to add secret `<NAME>` to
     GitHub" note so it isn't missed.

Because the source can't be verified green until the secret exists, treat it
like a proxy source for the new-source gate: leave the candidate as
`🔍 Investigating` (not `❌ Not Viable`) until Preston confirms the secret is set
and CI shows events.

### 7. Verify events and iterate with Q

After the PR is open:

1. **Check event count in CI** — Read the PR's GitHub Actions build log. Find the new source's event count.
   - **If 0 events because CI was blocked** (the log shows a `403`/`429`, a captcha/JS-challenge body, or a connection reset for this source) → the pipeline is fine; CI's IP is the problem. **Stage it for proxy testing (step 7a)** — do not keep hunting for a URL.
   - **If 0 events for any other reason** (and the source was not staged for proxy) → keep searching for the correct URL or source format. Update the candidate entry to `🔍 Investigating`. Do not mark `❌ Not Viable` unless you are confident no working URL exists. **Do not add `expectEmpty: true` to a new source with 0 events** — the build intentionally fails in this case to prevent merging unverified pipelines. `expectEmpty` is only appropriate after the pipeline has been confirmed to work at least once.

2. **Trigger Amazon Q review** — Post a top-level PR comment using this template (substituting the actual values):

   ```
   /q review

   Please review this new calendar source addition:
   - Verify the source (`<name>`) is not already covered elsewhere in the repo (check `sources/`, `sources/external/`, `sources/recurring/`)
   - Confirm the tags (`<tags>`) accurately reflect the type of events this source produces
   - Review the full implementation for correctness, completeness, and consistency with the existing external calendar schema
   ```

3. **If Q has blocking comments** → Steer the coding agent to fix them (`subagents(action="steer", message="...")`) → Push fixes → Re-trigger Q review with the same template → **Resolve each addressed review thread** using `mcp__github__resolve_review_thread` after either pushing the fix or posting a reply with clear reasoning why no action will be taken.

4. **Repeat** until Q is clean and no blocking comments remain and all review threads are resolved.

5. **When Q is clean + events confirmed (>0)** → Flip the candidate's `status:` frontmatter to `added` in `docs/source-candidates/<slug>.md` (and add the `pr:` field) and commit the update to the PR branch.

### 7a. Staging a CI-blocked source for proxy testing

When the pipeline is correct but CI can't fetch the source (step 6.2 → "CI blocks
it"), **do not merge and do not pick a proxy rung.** Stage the open PR so the
proxy-escalation skill can prove and merge the right rung from the out-of-band
environment:

1. **Leave the source at `proxy: false`.** You're not guessing a rung — that's
   proxy-escalation's job. Leave the PR open (ready-for-review is fine).
2. **Label the PR `requires-proxy-testing`:**
   ```
   mcp__github__issue_write  method: update  issue_number: <pr>  labels: ["requires-proxy-testing"]
   ```
   > `issue_write` replaces the PR's full label set, so include any labels it
   > should keep. GitHub usually auto-creates the label on first use; **if the
   > call is rejected because the label doesn't exist, stop and ask the human to
   > create the `requires-proxy-testing` label once** (repo → Labels → New label),
   > then retry. Do not silently skip the label — the out-of-band job finds these
   > PRs *by* that label.
3. **Add a PR-body note** so the reason is visible:
   `⏳ Needs proxy testing — pipeline verified locally, but CI is blocked (<evidence, e.g. HTTP 403 in run #NNN>). Left open for skills/proxy-escalation (out-of-band job) to test the ladder and merge the working rung.`
4. **Set the candidate `status: proxy`** in `docs/source-candidates/<slug>.md`,
   note that it's staged (`PR #NNN, awaiting proxy-ladder testing`), and bump
   `lastChecked`.
5. **Stop here for this source.** Do not merge, do not add `expectEmpty`, do not
   escalate rungs yourself. Report it as staged (see step 8) and move on — the
   next out-of-band run drains it. It is not counted as `added` until a rung is
   proven and the PR merges.

### 8. Report findings and request review

Include a "🔍 Source Discovery" section in the daily report:

```
🔍 Source Discovery
  ✅ Added: venue name — type — N events — PR #XXX (Q clean, ready for review)
  ⏳ Staged (needs proxy): venue name — type — PR #XXX (CI blocked; requires-proxy-testing — out-of-band job will test the ladder)
  💡 Candidate: venue name — type — URL
  ❌ Not viable: venue name — reason
  💀 Dead source flagged: source name — symptom
```

**When a source PR is Q-clean with confirmed events**, explicitly tag Preston for review:
> 🚀 **PR #XXX is ready for review** — [venue name], [type], [N events]. Amazon Q clean, events confirmed in CI.

## Important rules

- **Always open a PR** for new sources — never push ripper code direct to main
- **Open a PR for candidate updates** — even reference data changes need a PR (repo requires it). Per-candidate files live under `docs/source-candidates/`.
- **Always implement highest-confidence source first** — don't skip to low-confidence custom scrapers when a verified built-in type is available
- **One source per cycle** — implement, verify, iterate with Q, then report. Don't stack multiple sources in one cycle.
- **Always delegate to a coding agent** to implement the ripper — do not write code directly
- **Seattle-focused only** — sources must primarily serve Seattle audiences. A few events outside city limits is OK (e.g., Seattle Uncorked with some Eastside events). Venues entirely outside Seattle (Edmonds, Everett, Kent) are not appropriate.
- **Rotate search queries** — don't run the same searches every day
- **Check `docs/source-candidates/` first** — `ls` the directory, look for the slug; read the file's frontmatter to see status and history. Avoid re-proposing evaluated sources.
- **Flag dead sources** — but don't disable them without human approval
- **Respect the existing tag system** — adding a new tag is just using it in a source's `tags:` field. The build no longer requires registration in a central allow-list; it does fail on near-duplicate spellings (e.g. `"Capitol Hill"` vs `"CapitolHill"`). Check `lib/config/tags.ts` for the preferred spellings before introducing a new tag.
- **Tags should reflect a venue's PRIMARY identity** — only add a tag if the venue is primarily known for that category. A music venue that occasionally hosts comedy nights gets `Music` but NOT `Comedy`. A venue that is equally known for both (e.g., a comedy club that also does music) can have both. When in doubt, use fewer tags.
- **Validate the live source before implementing** — always attempt a fetch before writing parser code. A 200 with events in the Claude Code web environment is the only green light to implement. A 404 means the URL was wrong — keep searching. A 403, CAPTCHA, or any non-200 in Claude Code web means the source is blocked here; record it as `status: blocked` and move on — do not implement. Never implement a source you cannot fetch; an implementation written against an inaccessible URL is a guess.
- **Never *merge* a source that returns 0 events** — a source must produce at least 1 event before it merges. The build fails on new non-proxy sources with 0 events (no `expectEmpty` exemption for brand-new sources). A source with 0 events has no proven data pipeline. Keep as `🔍 Investigating` until the correct URL or data shape is found — **unless** the 0 is because CI is blocked, in which case stage it (`requires-proxy-testing`, `status: proxy`) and let the out-of-band proxy-escalation run prove a rung before it merges. Either way, nothing merges at 0 events.
- **Don't hand-pick a proxy rung — stage instead.** When CI blocks a source you
  can otherwise fetch locally, do not add `proxy: "outofband"`/`"browserbase"` and
  do not merge. Leave the PR open at `proxy: false`, label it
  `requires-proxy-testing`, set the candidate `status: proxy`, and stop (step 7a).
  `skills/proxy-escalation/SKILL.md` — running in the out-of-band job, the only
  place the proxy paths work — tests the ladder and merges the lowest working rung
  (or closes the PR if none work). If the source is inaccessible even locally
  (CAPTCHA, Cloudflare, connection refused), it isn't stageable: record it as
  `status: blocked` in `docs/source-candidates/<slug>.md` and do not implement it.
- **A 404 is not "not viable"** — it means the URL was wrong. Update the candidate to `🔍 Investigating` and keep searching for the correct URL. Only mark `❌ Not Viable` when no working URL can be found after investigation.
- **Iterate with Q until clean** — don't request human review until Amazon Q has no blocking comments.
- **Never hardcode source credentials** — when a source needs an API key/token/secret, read it from `process.env.<SOURCE>_<NAME>` (guard a missing value with a `ParseError`, never a hardcoded fallback), wire it into `.env.example` and the build workflow, and tell Preston to add the repo secret **in both the PR body and the chat report**. Hardcoded keys fail the gitleaks scan. See step 6a.
- **Parse methods must never return null** — new custom rippers must have parse methods that return `RipperCalendarEvent | RipperError` (never `null`). Filters and dedup belong in the caller, not the parse method. TypeScript enforces this at compile time. See AGENTS.md "Parse Methods Must Never Return Null" for the required pattern.
- **Prefer venue websites over showlists** — when a venue has its own website with event listings (e.g., neumos.com, thebarboza.com), use a dedicated ripper for that venue's site instead of relying on the showlists aggregator. Venue websites are the authoritative source for dates, times, ticket links, and images. When adding a dedicated source for a venue that showlists covers, mark it `skip: true` in showlists `VENUE_CONFIG`, remove its calendar entry from the showlists `ripper.yaml`, and add an empty file `allowed-removals/<name>.ics` (e.g., `allowed-removals/seattle-showlists-barboza.ics`) so the missing-URL check passes.
- **Check showlists sub-calendars** — `loadCalendarInventory()` lists sources (one per `ripper.yaml`), not sub-calendars. Multi-calendar sources like `seattle-showlists` appear as a single entry. Before proposing a "new" venue, check if it's already a sub-calendar inside an existing ripper (e.g., `seattle-showlists/ripper.yaml` calendars section and `VENUE_CONFIG`).
- **AXS skin venues support AJAX pagination** — AXS skin websites (`.eventItem` HTML structure) paginate via `{venue_url}/events/events_ajax/{offset}?category=0&venue=0&team=0&per_page=12&came_from_page=event-list-page`. The first page shows 12 events; keep fetching with offset+=12 until 0 events returned. Currently: Neumos (62 events), Barboza (64 events).

## Goals and Directives

### Goal: Add One New Source Every Run

**The primary goal of this skill is to add at least one new working source to the calendar every time it runs.** This is not optional — if the build is healthy, you must find and add a source.

- **Event count is NOT a criteria for rejection.** A source with 3 events is as valid as one with 300. Volume doesn't determine viability.
- **Any working source is better than no source.** Don't hold out for "better" candidates.
- **If you find a working source, implement it.** Don't leave it in the candidates file for "next time."

### Directive: Treat Local Checkout as Ephemeral

**All work must reach GitHub.** The local checkout is temporary — commits that don't get pushed are lost.

- **Always cut a feature branch** using `scripts/new_feature_branch.sh` or `git checkout -b feature/...`
- **Always push the branch** to origin
- **Always open a PR** — never leave changes local-only
- **Verify the PR URL** is returned to the user

### Directive: Low-Volume Sources Are Valid

Don't dismiss sources for having "only" a few events:

- **Shunpike (3 events)** — valid arts/community source
- **Book Larder (5 events)** — valid bookstore events
- **Cannonball Arts Center (6 events)** — valid new venue

Unique, curated events from small organizations are valuable. The calendar's strength is breadth and variety, not just volume.