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
  (within the new city's area — step 8's quality gates filter anything
  outside it). These aren't used by `init-city`; record them for step 8,
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
uncertainty cache, geocoder lookup tables, `allowed-removals/`, and the
Seattle-specific Discord notification workflow).

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

### 5. Set up the repo services before opening the PR

Do this **before** pushing the first PR, so the PR preview can deploy and
the review loop works from day one (the behavior matrix is in
`docs/city-template.md`, "Secrets, vars, and optional services"; detailed
steps in `docs/SETUP.md` steps 4–7).

1. **Amazon Q Developer for code reviews** — tell the operator that this
   workflow asks Amazon Q for a review on every PR (the `/q review`
   comments in AGENTS.md), and ask them to install it on their repo:
   <https://github.com/marketplace/amazon-q-developer>. Until it's
   installed, human review is the gate.
2. **Cloudflare Pages**: have them create a Pages project (custom domain
   is configured in the Cloudflare dashboard), then set the keys below.
3. **The full key list** — walk through it with the operator so nothing is
   discovered missing later:

   | Key | Kind | When it's needed |
   |---|---|---|
   | `CLOUDFLARE_API_TOKEN` | secret | **Now** — deploys (token needs Cloudflare Pages edit permission) |
   | `CLOUDFLARE_ACCOUNT_ID` | secret | **Now** — deploys |
   | `CLOUDFLARE_PAGES_PROJECT` | variable | **Now** — the Pages project name |
   | `SITE_URL` | variable | **Now** — `https://<domain>`, no trailing slash |
   | `TICKETMASTER_API_KEY` | secret | When the first `type: ticketmaster` source lands (the app's **Consumer Key**, not the secret) |
   | `EVENTBRITE_TOKEN` | secret | When the first `type: eventbrite` source lands (the app's **Private token**) |
   | `DICE_API_KEY` | secret | When the first `type: dice` source lands |
   | `BROWSERBASE_API_KEY` | secret | When the first `proxy: browserbase` source lands |
   | `CLAUDE_ROUTINE_ID` / `CLAUDE_ROUTINE_TOKEN` | secrets | With the build-error responder routine (step 7) |
   | `AWS_ROLE_ARN` / `OUTOFBAND_BUCKET` | secret / variable | Only if the out-of-band proxy is ever deployed |
   | `FAVORITES_API_URL` | variable | Only if the favorites worker is ever deployed |

   The four Cloudflare entries are the only ones required before the PR;
   confirm they're set before moving on.

### 6. Commit on a branch and open the PR

Follow the Development Workflow in AGENTS.md (branch → PR). With step 5
done, the PR gets a preview deploy and an Amazon Q review; if the operator
skipped the Q install, rely on human review.

### 7. Set up self-maintenance and optional services

1. **Self-maintenance**: the four Claude Code routines catalogued in
   `docs/routines.md` (build-error responder, daily source discovery,
   daily source implementation, GitHub-issues responder) — walk the
   operator through creating them in their Anthropic account using the
   suggested prompts there. Only the build-error responder needs repo
   secrets (`CLAUDE_ROUTINE_ID`/`CLAUDE_ROUTINE_TOKEN`).
2. **Optional**: Discord notifications (`init-city` deleted the
   Seattle-specific workflow — restore `.github/workflows/notify-discord.yml`
   from the upstream repo and set `DISCORD_WEBHOOK_CALENDAR` to enable),
   out-of-band proxy (AWS stack in `infra/authenticated-proxy/` — skip
   until a source actually needs it, and don't mark sources
   `proxy: outofband` before then), favorites worker
   (`infra/favorites-worker/` — advanced; the site runs read-only without
   it).

### 8. Add the first sources

Run `skills/source-discovery/SKILL.md` scoped to the new city, starting
from the seed list collected in step 1 — put the operator's named venues
and organizations through the skill's quality gates ahead of any cold
scan. Beyond the seeds, aim for a handful of high-volume, reliable
sources first (the city's biggest venues, the library system, a community
calendar). Each source lands as its own PR per the normal workflow.

### 9. Hand off

Leave the operator a written set-vs-pending checklist, not just a verbal
summary. It should cover:

- **Configured vs pending** — each key from the step 5 list (Cloudflare,
  per-source API keys, optional services) marked set or still to do, plus
  whether Amazon Q is installed
- **Routines created vs pending** — each of the four hooks in
  `docs/routines.md`, and whether `CLAUDE_ROUTINE_ID`/`CLAUDE_ROUTINE_TOKEN`
  are set for the build-error responder
- **Tier reached** — deployed / self-maintaining / full product, per the
  "What done looks like" tiers in `docs/SETUP.md`, and what's left to reach
  the next one
- **First-source PRs** opened, and where the health surfaces live
  (`<site>/build-errors.json`, the PR preview comments,
  `docs/city-template.md` for everything else)
