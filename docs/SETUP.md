# Setting up your city's instance

This walkthrough takes you from "clicked **Use this template**" to a live,
agent-maintained event calendar site for your city. The design behind all of
this lives in [`docs/city-template.md`](./city-template.md); this page is
just the steps.

## What done looks like

Setup lands in tiers — stop at whichever one you want:

1. **Deployed site** (steps 1–6, about an afternoon): the site is live at
   your `SITE_URL`, the daily build is green, and your first sources are
   merged and publishing events.
2. **Self-maintaining site** (+ the four Claude Code routines in step 7):
   broken sources get fixed, new sources get discovered and implemented,
   and user-filed issues get answered — without you in the loop. The
   routine set, with suggested prompts, is catalogued in
   [`docs/routines.md`](./routines.md).
3. **Full product** (+ the remaining step 7 services): Discord build
   notifications, the out-of-band proxy for bot-blocked sources, and
   sign-in/favorites via the Cloudflare Worker.

## 1. Create your repository

On GitHub, click **Use this template → Create a new repository**. Any name
works; you'll record the `owner/name` slug during configuration.

Clone it and install dependencies (Node 20+):

```sh
git clone https://github.com/<owner>/<repo>
cd <repo>
npm install   # postinstall also installs web/ dependencies
```

## 2. Configure your city

**Recommended:** open the repo in Claude Code and run
[`skills/city-setup/SKILL.md`](../skills/city-setup/SKILL.md) — it collects
your city's facts, runs the converter, tunes the geography, and walks you
through everything below.

**Manual:** run the converter yourself:

```sh
npm run init-city                                   # interactive prompts
# or, scripted:
npm run init-city -- --answers my-city.json --dry-run   # review the plan
npm run init-city -- --answers my-city.json --yes
```

This regenerates `city.config.ts` for your city and permanently deletes the
Seattle content (sources, candidate docs, caches, geocoder lookup tables,
and the Seattle-specific Discord notification workflow).
Afterwards, open `city.config.ts` and hand-tune the derived geographic
boxes — `map.clampBounds` should hug your populated metro,
`geocoder.nominatimViewbox` slightly larger, `venueSanityBbox` a generous
day-trip radius.

## 3. Verify locally

```sh
npm run typecheck
npm run test:all
npm run generate-calendars   # zero sources — must complete with 0 errors
```

Content-coupled tests self-skip on a stripped copy; everything else must
pass. Commit the result on a branch, but **before opening the PR** set up
Cloudflare (step 4) so the PR preview can deploy, and install Amazon Q
(step 8) so the PR gets reviewed. Then open and merge it — this is your
instance's baseline.

## 4. Cloudflare Pages (required — this is the site hosting)

1. Create a Pages project: dashboard → Workers & Pages → Create → Pages, or
   `npx wrangler pages project create <project-name>`.
2. In your GitHub repo settings, add **secrets**:
   - `CLOUDFLARE_API_TOKEN` — API token with Cloudflare Pages edit permission
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard
3. Add **repository variables** (Settings → Secrets and variables → Actions
   → Variables):
   - `CLOUDFLARE_PAGES_PROJECT` — the Pages project name
   - `SITE_URL` — `https://<your-domain>` (no trailing slash)
4. Custom domain: attach it to the Pages project in the Cloudflare
   dashboard. Until then the site serves from
   `https://<project>.pages.dev` — if you start there, use that URL as
   `SITE_URL` and in `city.config.ts` (`site.baseUrl`/`site.productionUrl`),
   and update both when the real domain is live.

## 5. First deploy

Push to `main`, or run the **"Generate Calendars and Publish to GitHub
Pages"** workflow manually (Actions → Run workflow). First runs are
tolerant by design: with no deployed site yet, the backwards-compatibility
URL check skips itself, and the geo/fetch caches cold-start empty.

## 6. Add your first sources

Follow [`skills/source-discovery/SKILL.md`](../skills/source-discovery/SKILL.md).
Start with a handful of high-volume, reliable sources — the city's biggest
venues, the library system, a community calendar. One source per PR; every
PR gets a preview at `https://pr-<n>.<project>.pages.dev` with a build
report comment.

## 7. Optional services

Everything below degrades gracefully when unset — add each one when you
need it. The full behavior matrix is in
[`docs/city-template.md`](./city-template.md#secrets-vars-and-optional-services).

### Per-source API keys (repo secrets)

Add only when you add a source of that type: `TICKETMASTER_API_KEY`,
`EVENTBRITE_TOKEN`, `DICE_API_KEY`, `BROWSERBASE_API_KEY` (Browserbase is
rung 3 of the proxy ladder — JS-challenge bypass).

Each provider hands you several credentials; use the right one:

- `TICKETMASTER_API_KEY` — the **Consumer Key** from your app at
  <https://developer.ticketmaster.com> (the Discovery API `apikey` parameter),
  **not** the Consumer Secret.
- `EVENTBRITE_TOKEN` — the **Private token** shown for your app at
  <https://www.eventbrite.com/platform/api-keys> (sent as the Bearer auth
  header), **not** the public token, API key, or client secret.

### Discord notifications

`init-city` deletes the Seattle-specific notification workflow. To enable
Discord on your copy, restore `.github/workflows/notify-discord.yml` from
the upstream repo (adjusting the hardcoded role mention), then set the
`DISCORD_WEBHOOK_CALENDAR` secret to a channel webhook URL. Build results
and actionable queues (uncertain events, photo/cost gaps, proxy
escalations) get posted after each run.

### Claude Code routines (the self-maintaining part)

The skills under `skills/` are the operating manual; routines are what run
them on a schedule. Routines are resources in *your* Anthropic account —
create them in Claude Code pointing at this repo. The reference instance
runs **four** automation hooks; suggested prompts and cadences for each are
in [`docs/routines.md`](./routines.md):

- **Build-error responder** — runs `skills/build-report/SKILL.md`; fired
  by the publish workflow when a daily build has errors (rate-limited to
  once per 24 h; bypass with a manual run and `force_routine=true`). This
  is the only hook wired to the repo: after creating it, set the
  `CLAUDE_ROUTINE_ID` and `CLAUDE_ROUTINE_TOKEN` secrets (skipped silently
  while unset).
- **Daily source discovery** — scans for new sources and records
  candidates (`skills/source-discovery/SKILL.md` steps 1–5).
- **Daily source implementation** — implements the highest-confidence
  candidate as a PR (steps 6–8).
- **GitHub-issues responder** — triages feedback-form and user-filed
  issues into fixes or new sources.

The last three are account-scheduled only — no repo secrets or workflow
changes.

### Out-of-band proxy (AWS — skip until a source actually needs it)

Some sites block GitHub Actions IPs (rung 2 of the proxy ladder). Don't set
this up preemptively, and don't mark sources `proxy: "outofband"` before it
exists. When needed: deploy `infra/authenticated-proxy/template.yaml`
(CloudFormation) **after changing the OIDC subject to your `owner/repo`**,
set the `AWS_ROLE_ARN` secret and `OUTOFBAND_BUCKET` variable, and run
`npm run generate-outofband` on a cron from a residential-IP machine. See
`docs/outofband.md`.

### Favorites / sign-in (Cloudflare Worker — advanced)

The site runs read-only without it (favorites in localStorage, no
sign-in). To enable: create the four KV namespaces, edit
`infra/favorites-worker/wrangler.toml` (worker name, route/custom domain,
KV ids, `SITE_URL`, `GITHUB_REPO`) and the CORS allowlist in
`infra/favorites-worker/src/index.ts`, create a Google OAuth client with
your callback URL, set the worker secrets (`JWT_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optionally
`FEEDBACK_GITHUB_ISSUES_TOKEN`), deploy via the **Deploy Favorites
Worker** workflow, then set the `FAVORITES_API_URL` repo variable.

## 8. Code review tooling

The agent workflow in `AGENTS.md` asks Amazon Q Developer for a code
review on every PR (the `/q review` comments). Install it on your repo —
ideally before your first PR — from the GitHub Marketplace:
<https://github.com/marketplace/amazon-q-developer>. If it isn't
installed, the `/q review` comments are inert; skip those steps and treat
human review as the gate — everything else in the workflow applies as
written.

## 9. Staying current with the upstream engine

Template copies don't track the upstream repo. To pull engine improvements:

```sh
git remote add upstream https://github.com/prestomation/206events
git fetch upstream
git merge upstream/main --allow-unrelated-histories   # first time only
git merge upstream/main                               # thereafter
```

Because your copy deleted the Seattle content once and never recreates the
same paths, merges touch engine files only; `city.config.ts` conflicts only
when the schema itself changes.

## Day-2 operations

- `https://<your-domain>/build-errors.json` is the single source of truth
  for build health; every reporting surface reads it.
- The skills under `skills/` are the operational runbook — `build-report`
  daily, the resolver skills to drain the non-fatal queues, `geo-resolver`
  to grow `KNOWN_VENUE_COORDS` for your city. The routines in
  [`docs/routines.md`](./routines.md) run that runbook for you.
- `AGENTS.md` is the contributor/agent manual for everything else.
