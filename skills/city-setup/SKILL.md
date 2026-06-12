# City Setup

Configure a fresh copy of this template repository for a new city. Run this
once, right after creating the repo from the template. The deterministic
mechanical work is done by `npm run init-city`; this skill wraps it with the
judgment calls (geography, neighborhoods, first sources) and walks the
operator through the external services.

**Do not run this on the reference instance (206.events / Seattle).** If
`city.config.ts` still says `name: "206.events"` and the user hasn't asked to
re-city the repo, you're in the wrong place.

## Steps

### 1. Collect the city's facts

Ask the user for (or confirm values they already gave):

- **City name and state/region code** — e.g. `Portland`, `OR`
- **IANA timezone** — e.g. `America/Los_Angeles`
- **Site domain** — the domain they'll serve from, e.g. `503.events`
  (they need to own it, or use the `<project>.pages.dev` domain initially)
- **Site name** — usually the domain; **boot logo text** — a short mark
  (area codes work well)
- **GitHub repo** — `owner/name` of their template copy
- **City center coordinates** — look these up yourself if not provided
- **Neighborhoods** — seed 10–25 well-known neighborhood names from your own
  knowledge of the city and confirm with the user. These become sidebar
  filter tags; natural casing with spaces (`"Pearl District"`). More get
  added organically as sources are tagged.
- **GoatCounter code** (optional) — leave analytics off unless they have one
- **Seed sources** — ask for their favorite music venues, community
  organizations, museums, and any community calendar they already read
  (within the new city's area — step 7's quality gates filter anything
  outside it). These aren't used by `init-city`; record them for step 7,
  where they become the first source candidates. Local knowledge beats a
  cold discovery scan for the first batch.

### 2. Run init-city

Write the answers to a JSON file and run the script (see the answers shape
in `scripts/init-city.ts`):

```bash
npm run init-city -- --answers /tmp/city-answers.json --dry-run   # review the plan
npm run init-city -- --answers /tmp/city-answers.json --yes
```

This regenerates `city.config.ts`, rebrands `web/src/sw.js` and `README.md`,
and strips all Seattle content (sources, candidate docs, discovery logs,
uncertainty cache, geocoder lookup tables, `allowed-removals/`).

### 3. Tune the derived geography

`init-city` derives the map clamp bounds, Nominatim viewbox, and venue
sanity bbox from the city center. These are rough boxes — open
`city.config.ts` and tighten them to the real metro shape:

- `map.clampBounds` should hug the populated metro/county (it rejects
  outliers from the default map fit; Seattle's hugged King County)
- `geocoder.nominatimViewbox` slightly larger than the clamp bounds
- `venueSanityBbox` generous — day-trip radius; CI fails venues outside it

### 4. Verify the stripped repo

```bash
npm run typecheck
npm run test:all
npm run generate-calendars   # zero sources — must complete with 0 errors
```

All three must pass before the first commit. The build will note zero-event
aggregate output; that's expected with no sources yet.

### 5. Commit on a branch and open the PR

Follow the Development Workflow in AGENTS.md (branch → PR). Note for copies:
the Amazon Q review steps in AGENTS.md only apply if Q is installed on the
repo; otherwise rely on human review.

### 6. Walk the operator through external services

Follow `docs/SETUP.md` steps 4–7 (the behavior matrix is in
`docs/city-template.md`, "Secrets, vars, and optional services"). The
minimum to get a live site:

1. **Cloudflare Pages**: create a project, then set repo secrets
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and repo variables
   `CLOUDFLARE_PAGES_PROJECT` (the project name) and `SITE_URL`
   (`https://<domain>`). Custom domain is configured in the Cloudflare
   dashboard.
2. **Per-source API keys** — only as sources need them
   (`TICKETMASTER_API_KEY`, `EVENTBRITE_TOKEN`, `DICE_API_KEY`,
   `BROWSERBASE_API_KEY`).
3. **Self-maintenance**: the four Claude Code routines catalogued in
   `docs/routines.md` (build-error responder, daily source discovery,
   daily source implementation, GitHub-issues responder) — walk the
   operator through creating them in their Anthropic account using the
   suggested prompts there. Only the build-error responder needs repo
   secrets (`CLAUDE_ROUTINE_ID`/`CLAUDE_ROUTINE_TOKEN`).
4. **Optional**: Discord webhook (`DISCORD_WEBHOOK_CALENDAR`), out-of-band
   proxy (AWS stack in `infra/authenticated-proxy/` — skip until a source
   actually needs it, and don't mark sources `proxy: outofband` before
   then), favorites worker (`infra/favorites-worker/` — advanced; the site
   runs read-only without it).

### 7. Add the first sources

Run `skills/source-discovery/SKILL.md` scoped to the new city, starting
from the seed list collected in step 1 — put the operator's named venues
and organizations through the skill's quality gates ahead of any cold
scan. Beyond the seeds, aim for a handful of high-volume, reliable
sources first (the city's biggest venues, the library system, a community
calendar). Each source lands as its own PR per the normal workflow.

### 8. Hand off

Leave the operator a written set-vs-pending checklist, not just a verbal
summary. It should cover:

- **Configured vs pending** — each secret/var from step 6 (Cloudflare,
  per-source API keys, Discord) marked set or still to do
- **Routines created vs pending** — each of the four hooks in
  `docs/routines.md`, and whether `CLAUDE_ROUTINE_ID`/`CLAUDE_ROUTINE_TOKEN`
  are set for the build-error responder
- **Tier reached** — deployed / self-maintaining / full product, per the
  "What done looks like" tiers in `docs/SETUP.md`, and what's left to reach
  the next one
- **First-source PRs** opened, and where the health surfaces live
  (`<site>/build-errors.json`, the PR preview comments,
  `docs/city-template.md` for everything else)
