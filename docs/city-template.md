# City Template: turning this repo into a GitHub template for any city

## Status

- **Phase 1 (this PR): implemented** — central `city.config.ts`, all easy
  hardcoded values migrated, Seattle behavior unchanged.
- **Phase 2 (this PR): implemented** — `npm run init-city` script
  (`scripts/init-city.ts`) + `skills/city-setup/SKILL.md`. Both are inert
  for the reference instance; the strip only runs when a template user
  invokes it.
- **Phase 3 (this PR): docs implemented** — `docs/SETUP.md` (the full
  from-template walkthrough), the README template pitch, and the Amazon Q
  carve-out in AGENTS.md. Two steps remain for the repo owner (they can't
  be done from code): enable **Settings → Template repository** on GitHub,
  and set the `CLOUDFLARE_PAGES_PROJECT` / `SITE_URL` repository variables
  on the reference instance so the workflow defaults are exercised either
  way.

## Goals

- Anyone can create their own city's version of this site: click GitHub's
  **Use this template** button, run a setup flow that asks for their city's
  values (name, domain, timezone, map center/bounds, neighborhoods),
  configure the required GitHub secrets, and get a working
  agent-maintained event calendar site.
- **This repo is the template.** 206.events remains the reference instance
  living on `main`. There is no separate scaffold repo to keep in sync — the
  engine and the template are the same code, so engine improvements land in
  the template automatically.
- Seattle behavior never changes during the refactor. Every migration PR
  must produce byte-identical output for the 206.events configuration.

## Non-goals

- Multi-city support in a single deployment. One repo copy = one city.
- A hosted SaaS. Template users run their own GitHub Actions, Cloudflare
  Pages project, and (optionally) Claude routines.
- Automatic upstream tracking for template copies (see "Upgrade story").
- Making every Seattle string disappear in Phase 1. Seattle *content*
  (sources, candidate docs, geocoder lookup tables) stays until the Phase 2
  init script strips it from a fresh copy.

## Architecture: engine vs. content vs. config

Everything in the repo falls into one of three buckets. The template story
is: **engine ships as-is, config is a single file the user edits, content is
deleted and regrown for the new city.**

| Bucket | What | Paths |
|---|---|---|
| **ENGINE** | City-agnostic code and automation | `lib/` (except noted tables), `scripts/`, `web/`, `skills/`, `.github/workflows/`, `infra/`, `index.ts` |
| **CONFIG** | The single edit surface for a new city | `city.config.ts` (repo root) |
| **CITY CONTENT** | Seattle data a new city deletes and regrows | ~160 source dirs under `sources/`, ~95 `sources/recurring/*.yaml`, `sources/external/*.yaml`, `sources/seattle_showlists/` (incl. its `VENUE_CONFIG`), `docs/source-candidates/` (~180 files), `docs/discovery-log/` (~50 files), `event-uncertainty-cache.json` (~920 KB of Seattle resolutions), `allowed-removals/`, Seattle entries in `ideas.md`, Seattle lookup tables in `lib/geocoder.ts` (`SEATTLE_NEIGHBORHOOD_CENTROIDS`, `SPL_BRANCH_COORDS`, `UW_BUILDING_COORDS`, `UW_NAMED_LOCATIONS`, `KNOWN_VENUE_COORDS`) |

`geo-cache.json` and `fetch-cache.json` are already committed as empty
cold-start baselines and need no template treatment.

## The city config (`city.config.ts`)

A plain TypeScript object literal at the repo root, committed with Seattle
values. Every field carries a comment explaining what a new city sets it to —
this file is the template's primary UX surface.

**Why TS, not JSON:**

- Web code already imports repo-root TypeScript directly into the Vite
  bundle (`web/src/redesign/categories.js` imports `lib/config/tags.ts`;
  `web/vite.config.js` sets `server.fs.allow: ['..']`). A root
  `city.config.ts` is consumable from `lib/`, `scripts/`, `web/src/`, and
  `web/vite.config.js` with zero new tooling.
- JSON imports under `module: NodeNext` require import attributes
  (`with { type: "json" }`), which the esbuild bundled with Vite 5 does not
  reliably parse. (`resolveJsonModule` is intentionally off in
  `tsconfig.json`.)
- TS allows comments.

**Validation split — Zod stays out of the web bundle:**

- `lib/config/city.ts` (Node-only) holds the Zod schema
  (`cityConfigSchema`), the inferred `CityConfig` type, and the validated
  `CITY` export used by build code. Cross-field invariants (map center
  inside clamp bounds inside the venue sanity bbox, baseUrl trailing slash,
  unique neighborhoods) live here. A broken edit by a template user fails
  the build immediately with a readable message.
- Web code and `lib/config/tags.ts` (which is web-reachable) import the
  **raw** `city.config.ts` — never `lib/config/city.ts` — so Zod is never
  bundled into the site.
- `city.config.ts` itself uses `satisfies CityConfig` (type-only import,
  erased at runtime — no cycle) so editor/typecheck feedback is immediate.

### Schema reference

| Field | Consumers | New city sets it to |
|---|---|---|
| `city.name`, `city.state` | Ticketmaster venue-address fallback (`lib/config/ticketmaster.ts`), web UI copy (onboarding, loading screen, channel cards, feedback placeholder) | e.g. `Portland`, `OR` |
| `city.timezone` | Default timezone for new-source docs and the Phase 2 init script (existing source YAMLs declare their own) | IANA zone, e.g. `America/New_York` |
| `site.name` | `<title>`, PWA manifest, llms.txt, web "add to calendar" PRODID | e.g. `503.events` |
| `site.description` | `<meta name="description">` | One sentence |
| `site.baseUrl` / `site.productionUrl` | RSS/sitemap URL base and deployed-site probe in `lib/calendar_ripper.ts` (env vars `SITE_BASE_URL` / `PRODUCTION_URL` still take precedence), out-of-band report fetch | The deployed site origin |
| `site.repo` | llms.txt source/issue links, web feedback fallback link | `owner/repo` of the copy |
| `site.bootLogoText` | Pre-paint boot splash + loading screen mark | Short mark, e.g. area code |
| `ics.prodId` | ICS `PRODID` in generated calendars (`lib/config/schema.ts`) and error calendars | Usually same as `site.name` |
| `geocoder.nominatimUserAgent` | Nominatim requests (`lib/geocoder.ts`, `scripts/backfill-osm-ids.ts`) — [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) requires identifying yourself | `<site>/1.0 (<url>)` |
| `geocoder.nominatimViewbox` | `viewbox=…&bounded=1` on geocode queries so ambiguous venue names resolve inside the metro | Tight box around the metro |
| `map.center`, `map.defaultZoom` | Map default view (`web/src/components/EventsMap.jsx`) | City center |
| `map.clampBounds` | Metro-extent box that rejects far-flung outliers from the default map fit | Metro/county extent |
| `venueSanityBbox` | CI sanity check on venue coordinates (`scripts/check-discovery-api.ts`) | Generous regional box |
| `neighborhoods` | `TAG_CATEGORIES['Neighborhoods']` in `lib/config/tags.ts` — drives the sidebar grouping and neighborhood filters | The city's neighborhood tag list (grows over time) |
| `analytics` | GoatCounter snippet injection at web build time; `null` disables analytics entirely (the template default after init) | `{ goatcounterCode }` or `null` |

## Phase 1: central config (implemented in this PR)

Migrations, all behavior-neutral for the Seattle config:

- **Node side** (imports validated `CITY` from `lib/config/city.js`):
  `lib/calendar_ripper.ts` (`SITE_BASE_URL`/`PRODUCTION_URL` env fallbacks,
  error-calendar PRODID, llms.txt token replacement), `lib/config/schema.ts`
  (`productId`), `lib/geocoder.ts` (user-agent, viewbox),
  `lib/config/ticketmaster.ts` (city/state fallbacks),
  `scripts/check-discovery-api.ts` (venue bbox),
  `scripts/backfill-osm-ids.ts` (user-agent),
  `scripts/generate-outofband.ts` (build-errors URL).
- **Web side** (imports raw `city.config.ts`): `EventsMap.jsx`
  (center/zoom/clamp bounds; `isWithinKingCounty` renamed
  `isWithinClampBounds`), `web/index.html` (placeholders substituted by a
  Vite plugin; GoatCounter snippet injected only when configured),
  `web/vite.config.js` (placeholder transform + webmanifest generation),
  `web/src/utils/calendar.js` (PRODID), copy interpolation in
  `views.jsx`, `ChannelCard.jsx`, `Onboarding.jsx`, `FeedbackModal.jsx`,
  `LoadingScreen.jsx`.
- **Shared**: `lib/config/tags.ts` `Neighborhoods` comes from the config
  (raw import — web-reachable module).
- **Workflows**: Cloudflare Pages project name via
  `${{ vars.CLOUDFLARE_PAGES_PROJECT || '206events' }}`; Discord workflow
  site URL via `${{ vars.SITE_URL || 'https://206.events' }}`.
- **Templates**: `lib/templates/llms.txt` tokenized
  (`{{SITE_NAME}}`, `{{SITE_URL}}`, `{{CITY_NAME}}`, `{{REPO}}`), replaced
  at copy time in `lib/calendar_ripper.ts`.

**Intentionally untouched in Phase 1:**

- The Seattle lookup tables in `lib/geocoder.ts`. They are interleaved with
  engine logic, harmless for other cities (their keys simply never match),
  and get stripped by the Phase 2 init script. Header comments mark them as
  Seattle reference content.
- `sources/seattle_showlists/` — a whole Seattle subsystem; deleted (not
  parameterized) for new cities.
- `web/src/sw.js` — copied raw into `output/`, so it cannot import the
  config. Its strings are a Phase 2 init-script rewrite target.
- `web/src/redesign/App206.jsx` and the `app206`/`useApp206` names —
  internal identifiers with 9+ import sites; renaming is churn with no
  user-facing benefit. Optional cosmetic cleanup later.
- `infra/favorites-worker/` and `infra/authenticated-proxy/` — see
  "Optional services" below; both are opt-in and carry instance-specific
  values (KV namespace ids, routes, OIDC subject) that belong to whoever
  deploys them.
- `README.md` / `AGENTS.md` prose — reworded in Phase 3 alongside the
  template/instance README split.

## Phase 2: init script + city-setup skill + content strip

### `scripts/init-city.ts` (`npm run init-city`)

Deterministic, idempotent, no LLM required. Prompts for the config values
(or accepts a JSON answers file), then:

1. **Regenerates `city.config.ts`** from the answers — whole-file
   generation, not patching, so it cannot half-apply. Answers are validated
   through the Zod schema *before* any destructive action runs. Map clamp
   bounds, Nominatim viewbox, and the venue sanity bbox are derived from
   the city center (rough defaults the city-setup skill hand-tunes after).
2. **Rewrites the non-importable files**: the brand strings in
   `web/src/sw.js`, plus generated `README.md` and `ideas.md`.
3. **Strips Seattle content**: deletes `sources/*` ripper dirs (including
   `seattle_showlists/`), `sources/recurring/*`, `sources/external/*`
   (keeping both dirs via `.gitkeep`), `docs/source-candidates/*` and
   `docs/discovery-log/*` (keeping each README), `allowed-removals/*`;
   resets `event-uncertainty-cache.json` to `{"version":1,"entries":{}}`;
   deletes `outofband-report.json` (the build tolerates its absence);
   prunes the five Seattle lookup tables in `lib/geocoder.ts` to empty
   stubs (the surrounding matching logic is table-driven, so empty tables
   are clean no-ops).
4. **No fake example sources.** A placeholder external feed would produce
   fetch errors and a placeholder recurring entry would publish fabricated
   events; instead, the build is verified to run green with zero sources
   (city-setup step 4), and the existing skills are the reference for adding
   the first real ones.

### `skills/city-setup/SKILL.md`

The judgment layer on top. Orchestrates `init-city`, then:

- Seeds `neighborhoods` for the new city (model knowledge + user
  confirmation) and picks sensible map bounds.
- Walks the secrets/vars checklist (below) and the Cloudflare Pages project
  creation.
- Explains the Claude routine setup (below) and what each recurring skill
  does.
- Runs a first `source-discovery` pass scoped to the new city and opens the
  first source PRs.
- Verifies the first full build and deploy.

### Genericizing skills

Skill prose and scripts reference `https://206.events` and "Seattle" in ~78
places across 18 files. The pattern to migrate them is already established
by `skills/event-lookup` (`$EVENT_LOOKUP_SITE` env var with a default):

- `scripts/print-city-config.ts` (added in Phase 1) lets SKILL.md
  instructions and Python helpers read `site.productionUrl`, `city.name`,
  etc. (`tsx scripts/print-city-config.ts site.productionUrl`).
- `source-discovery`'s search queries and the "Seattle-area only" quality
  gate become "{{city}}-area" parameterized via the config.
- `geo-resolver`'s Seattle tables are documented as reference content; its
  procedure (Nominatim, KNOWN_VENUE_COORDS PRs) is already city-agnostic.

## Phase 3: docs + flip the bit

- **`docs/SETUP.md`** — the full from-scratch walkthrough: create from
  template → run city-setup → secrets/vars → Cloudflare Pages → optional
  services → routines.
- **README split** — template-facing README ("build this for your city")
  with the 206.events instance intro moved to the deployed site/docs.
- **AGENTS.md** — mark the Amazon Q review steps (`/q review`) as optional:
  template users likely don't have Q installed; the PR flow degrades to
  ordinary human review.
- **Enable "Template repository"** in GitHub settings (manual, by the
  repo owner).
- On the reference instance, set repo vars `CLOUDFLARE_PAGES_PROJECT` and
  `SITE_URL` explicitly so the expression defaults are exercised either way.

## Operator journey

The from-template UX is deliberately documentation-driven (no setup
wizard or verification tooling), so the journey is framed as **tiers**,
each with an explicit definition of done. `docs/SETUP.md` carries the
user-facing version of this; the entry points chain together —
the template README's "Build this for your own city" section →
`docs/SETUP.md` → `skills/city-setup/SKILL.md` (the agent-run variant),
and `init-city` itself prints the same pointers when it finishes.

1. **Deployed site** — repo created from template, `init-city` run,
   geography hand-tuned, Cloudflare Pages wired (`CLOUDFLARE_*` secrets,
   `CLOUDFLARE_PAGES_PROJECT`/`SITE_URL` vars), first build published,
   first sources merged. *Done when:* the site is live at `SITE_URL`, the
   daily build is green, and at least a handful of sources publish events.
2. **Self-maintaining site** — the four automation hooks in
   `docs/routines.md` exist in the operator's Anthropic account
   (build-error responder, daily source discovery, daily source
   implementation, GitHub-issues responder). *Done when:* a broken source
   gets fixed, a new source lands, and a feedback issue gets answered with
   no human in the loop.
3. **Full product** — the remaining optional services: Discord
   notifications, out-of-band proxy (only once a source needs it), and the
   favorites worker. *Done when:* whichever of these the operator wants is
   live; all of them degrade gracefully when absent (see the matrix below).

## Secrets, vars, and optional services

| Service | Secrets / vars | Required? | Behavior when absent |
|---|---|---|---|
| **Cloudflare Pages** (site hosting) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secrets; `CLOUDFLARE_PAGES_PROJECT` var | **Required** | Build succeeds, deploy step fails — nothing publishes |
| **Site URL** | `SITE_URL` var (Discord workflow), `SITE_BASE_URL`/`PRODUCTION_URL` env overrides | Defaults from `city.config.ts` | Falls back to config values |
| **Platform APIs** | `TICKETMASTER_API_KEY`, `EVENTBRITE_TOKEN`, `DICE_API_KEY` secrets | Per-source | Only sources of that type fail; isolated parse errors |
| **Browserbase** (JS-challenge bypass) | `BROWSERBASE_API_KEY` secret | Per-source | `proxy: browserbase` sources fail; others unaffected |
| **Out-of-band proxy** (AWS) | `AWS_ROLE_ARN` secret, `OUTOFBAND_BUCKET` var; CloudFormation stack in `infra/authenticated-proxy/` (OIDC subject must be set to the copy's `owner/repo`); a residential-IP runner cron | Optional | Already graceful: the AWS-credentials step is `continue-on-error`, `scripts/download-outofband.ts` exits 0 when S3 is unreachable, and `proxy: outofband` sources sit in the non-fatal `pendingProxyVerification` queue. A copy that never sets this up simply shouldn't mark sources `outofband` |
| **Discord notifications** | `DISCORD_WEBHOOK_CALENDAR` secret; `init-city` deletes the Seattle-specific `notify-discord.yml` on copies — restore it from upstream to enable | Optional | Reference instance: workflow skips posting when the secret is unset. Copies: no workflow at all until restored |
| **Claude routines** | `CLAUDE_ROUTINE_ID`, `CLAUDE_ROUTINE_TOKEN` secrets — these gate **only** the webhook-fired build-error responder; the other three hooks in `docs/routines.md` live wholly in the operator's account | Optional | The trigger step in `publish_calendars.yml` skips when unset; build-error fixing becomes manual |
| **Favorites** (sign-in, personal feeds) | `FAVORITES_API_URL` var → `VITE_FAVORITES_API_URL`; Cloudflare Worker deploy with KV namespaces + `JWT_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, optional `FEEDBACK_GITHUB_ISSUES_TOKEN` | **Optional, off by default** | Web UI runs in read-only mode (no sign-in, favorites in localStorage); this is the template default |

### Favorites worker (advanced, opt-in)

Enabling favorites for a copy means: create four KV namespaces, edit
`infra/favorites-worker/wrangler.toml` (worker name, route/custom domain,
KV ids, `SITE_URL`, `GITHUB_REPO`), update the CORS allowlist in
`infra/favorites-worker/src/index.ts`, create a Google OAuth client with the
copy's callback URL, set the worker secrets, deploy via
`deploy-favorites-worker.yml`, then set the `FAVORITES_API_URL` repo var.
This is deliberately documentation-driven rather than templated — every
value is instance-specific and the worker is independent of the calendar
build.

## Claude routines (the automation outside the repo)

The recurring agent operations run as **Claude Code routines** — resources
created in the user's Anthropic account, not shippable repo files. The
reference instance runs **four hooks**, catalogued with suggested prompts
and cadences in `docs/routines.md`:

1. **Build-error responder** — runs `skills/build-report/SKILL.md`. The
   repo's only routine coupling is here: the trigger step in
   `publish_calendars.yml` fires
   `POST /v1/claude_code/routines/{CLAUDE_ROUTINE_ID}/fire` (rate-limited
   to once per 24 h) when a build has errors, and skips silently when the
   secrets are unset.
2. **Daily source discovery** — `skills/source-discovery/SKILL.md`
   steps 1–5 (candidates only), account-scheduled.
3. **Daily source implementation** — steps 6–8 (implement the
   highest-confidence candidate), account-scheduled.
4. **GitHub-issues responder** — triages feedback-form and user-filed
   issues into fixes or new-source PRs, issue-driven.

Template users who want the self-maintaining behavior create their own
copies of these from the catalog; only the build-error responder requires
storing the routine id/token as the two repo secrets. Everything the
routines need inside the repo — the skills, AGENTS.md conventions, the
`build-errors.json` contract — ships with the template.

## Upgrade story (honest)

GitHub template copies do **not** track the upstream repo — "Use this
template" produces an unrelated history. The supported path for pulling
engine improvements:

```sh
git remote add upstream https://github.com/prestomation/206events
git fetch upstream
git merge upstream/main --allow-unrelated-histories   # first time only
```

The engine/content separation is what keeps these merges tractable: a copy
deletes Seattle content once and never recreates the same paths, so merges
touch engine files only. `city.config.ts` will conflict only when the
schema itself changes. There is no promise of automated updates; breaking
engine changes should be called out in commit/PR descriptions.

## Known hard parts

- **`lib/geocoder.ts` lookup tables** — ~100 Seattle entries interleaved
  with matching logic. Phase 2 prunes them; a new city regrows
  `KNOWN_VENUE_COORDS` organically via the geo-resolver skill.
- **`sources/seattle_showlists/`** — a Seattle-specific aggregation
  subsystem (40+ venue `VENUE_CONFIG`); deleted for new cities rather than
  parameterized. Other cities with an equivalent aggregator write their own
  ripper.
- **Amazon Q review** — AGENTS.md's PR flow assumes `/q review`. Optional
  for copies; needs a docs carve-out (Phase 3).
- **Manual console setup** — Cloudflare Pages project + custom domain,
  Google OAuth consent screen, KV namespaces, AWS CloudFormation stack:
  inherently manual, documentation-driven.
- **Event volume expectations** — gates like the new-source 0-events check
  and discovery budgets were tuned for a large metro; small cities may want
  `expectEmpty` more aggressively. Documented, not changed.
