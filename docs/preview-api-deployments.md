# Preview API Deployments (staging worker + auth handoff)

PR previews need to exercise the favorites worker's **API and auth code** with a
real Google login, without touching real users' data. This doc describes the
mechanism that makes that work: a single, data-isolated **staging worker** that
the preview site is built against, plus a **prod→staging auth handoff** that
lets login succeed even though only the production worker is a registered Google
OAuth callback.

This supersedes the proposal in `docs/idea-staging-worker.md`. The key
difference from that proposal: we do **not** register a second Google OAuth
callback. Google only ever sees `https://api.206.events/auth/callback`; the
staging worker receives an already-authenticated identity from prod via a
short-lived ticket.

## Why a handoff is required

Two hard constraints rule out the obvious "just point previews at a staging
worker and log in there" approach:

1. **OAuth `redirect_uri` is exact-match.** Google rejects any callback host
   that isn't pre-registered, and wildcards aren't allowed. Registering every
   preview/staging host is infeasible, so the callback must always be the one
   production host, `api.206.events/auth/callback`.
2. **The session cookie is host-only.** The worker sets
   `session=…; HttpOnly; Secure; SameSite=None` scoped to the host that issued
   it (no `Domain=`). A cookie set by `api.206.events` is unreadable by a worker
   on `api-staging.206.events`.

The unlock: the session is a symmetric **HS256 JWT**, and the staging worker
runs the **same codebase** as prod. So prod can mint a short-lived **handoff
ticket** (signed with a shared `HANDOFF_SECRET`), redirect the browser to the
staging worker, and the staging worker verifies the ticket and sets **its own**
session cookie on **its own** host. Google never sees the staging host.

## The redirect chain

```
Preview UI  (https://pr-N.206events.pages.dev)
  bundle built with VITE_FAVORITES_API_URL = https://api-staging.206.events
  │  user clicks “Sign in”
  ▼
GET https://api-staging.206.events/auth/login?return_to=<preview-UI>
  │  AUTH_MODE=staging → delegate (this host is not a Google callback)
  ▼  302
GET https://api.206.events/auth/login?provider=google&return_to=<preview-UI>&handoff=https://api-staging.206.events
  │  validates handoff against exact allowlist, threads it into OAuth `state`
  ▼  302
Google OAuth  →  302
GET https://api.206.events/auth/callback?code=…&state=…
  │  exchanges code, upserts user, sees state.handoff (+ HANDOFF_SECRET set)
  │  mints a 60s ticket; does NOT set a prod session cookie
  ▼  302
GET https://api-staging.206.events/auth/handoff?ticket=<60s JWT>&return_to=<preview-UI>
  │  verifies ticket (shared HANDOFF_SECRET), upserts user in STAGING KV,
  │  mints a session with staging's OWN JWT_SECRET, sets host-only cookie
  ▼  302
<preview-UI>  →  now fetch()es https://api-staging.206.events/* with
                 credentials:'include' (CORS allows *.206events.pages.dev)
```

When `STAGING_ORIGIN`/`HANDOFF_SECRET` are unset on prod, the callback skips the
handoff branch entirely and behaves exactly as before (sets the prod session
cookie). The whole feature is inert until staging is provisioned.

## Security controls

- **Handoff target is exact-match.** `isAllowedHandoffOrigin` (in `auth.ts`)
  only accepts `https` and an `origin` equal to the configured `STAGING_ORIGIN`
  (`https://api-staging.206.events`) — our own zone, one fixed host. There is no
  `*.workers.dev` wildcard; that domain is shared across every Cloudflare
  account and would allow ticket exfiltration. Returns `false` when
  `STAGING_ORIGIN` is unset.
- **Dedicated, short-lived ticket.** The ticket is signed with `HANDOFF_SECRET`
  (separate from each worker's session `JWT_SECRET`), carries `aud:"handoff"`
  (checked on consume), and expires in 60s — long enough to survive the redirect
  chain, short enough that a ticket captured from a URL (logs, history) is
  useless almost immediately. A leaked session can't be replayed as a handoff
  and vice-versa.
- **Secret isolation.** Staging's session `JWT_SECRET` differs from prod's, so a
  staging session cookie is not valid against prod (or vice-versa). Only the
  handoff ticket crosses the boundary.
- **Return-URL scoping.** `isAllowedReturnUrl` accepts `*.206events.pages.dev`
  (https only) — this exact project's Pages subdomain, never bare `*.pages.dev`.
- **CORS scoping.** `isAllowedOrigin` (in `index.ts`) echoes back only the prod,
  staging, localhost, and `*.206events.pages.dev` origins for credentialed
  requests.

## Data isolation & operational model

- The staging worker (`[env.staging]` in `wrangler.toml`) binds **separate KV
  namespaces** from prod, so preview sign-ins and favorites mutations never
  touch real users' data. First sign-in on staging seeds a fresh staging user
  record (so a user's prod favorites won't appear on a preview — expected).
- **Last-PR-wins.** Staging is a single shared host. The PR-preview workflow
  deploys *each PR's* worker code to it (`wrangler deploy --env staging`), and
  the main deploy resets it to `main` after a merge. Concurrent PRs clobber each
  other on staging; acceptable for a single-maintainer repo.
- **Fork PRs are skipped.** The staging-deploy job is gated on the PR coming
  from the same repo (fork PRs have no secrets).

## Configuration surface

Worker (`infra/favorites-worker/`):

| Setting | Prod | Staging |
|---|---|---|
| `AUTH_MODE` | unset / `"prod"` | `"staging"` |
| `PROD_AUTH_ORIGIN` | — | `https://api.206.events` |
| `STAGING_ORIGIN` | `https://api-staging.206.events` (enables issuer allowlist) | `https://api-staging.206.events` (self origin) |
| `HANDOFF_SECRET` (secret) | shared value (enables issuer) | same shared value (enables consumer) |
| `JWT_SECRET` (secret) | prod session secret | staging's own (different) session secret |
| KV namespaces | prod ids | separate staging ids |

CI:

- `build-calendars.yml` takes a `favorites-api-url` input; the web build uses
  `inputs.favorites-api-url || vars.FAVORITES_API_URL`.
- `pr-preview.yml` passes `favorites-api-url: ${{ vars.STAGING_FAVORITES_API_URL }}`
  and has a `deploy-staging-worker` job. Both are gated on the
  `STAGING_FAVORITES_API_URL` repo variable, so previews stay UI-only (against
  prod) until that variable is set.
- `deploy-favorites-worker.yml` redeploys staging from `main` after a merge
  (same gate).

## One-time provisioning runbook

Performed by a human with Cloudflare + Google access. Until step 5, everything
is inert and previews behave as UI-only against the prod worker.

1. **Create four staging KV namespaces** and paste their ids into the
   `[[env.staging.kv_namespaces]]` blocks in `wrangler.toml` (do **not** reuse
   prod ids):
   ```sh
   cd infra/favorites-worker
   wrangler kv namespace create USERS       --env staging
   wrangler kv namespace create FAVORITES    --env staging
   wrangler kv namespace create FEED_TOKENS  --env staging
   wrangler kv namespace create RATE_LIMIT   --env staging
   ```
2. **Set secrets:**
   ```sh
   # A fresh, independent session secret for staging:
   wrangler secret put JWT_SECRET     --env staging
   # The SAME shared handoff secret on both workers:
   wrangler secret put HANDOFF_SECRET --env staging
   wrangler secret put HANDOFF_SECRET            # prod (top-level env)
   ```
3. **Deploy staging once** to provision the `api-staging.206.events` custom
   domain (DNS is created from the route on first deploy):
   ```sh
   wrangler deploy --env staging
   ```
   Confirm `https://api-staging.206.events/health` returns `{ "ok": true }`.
4. **(prod)** `STAGING_ORIGIN` is already in `wrangler.toml`; the next prod
   deploy (or `wrangler deploy`) plus the `HANDOFF_SECRET` from step 2 activates
   the issuer half.
5. **Flip the toggle:** set the repo variable
   `STAGING_FAVORITES_API_URL=https://api-staging.206.events`. From the next PR,
   preview bundles target staging and the staging-deploy jobs run.

No Google Cloud console change is needed at any step — the only registered
redirect URI remains `https://api.206.events/auth/callback`.

## Verifying end-to-end

1. Open a PR; wait for the preview + `deploy-staging-worker` job.
2. Visit `https://pr-<N>.206events.pages.dev`, click sign in, complete Google
   login. The browser should land back on the preview URL.
3. In devtools: the post-login `Set-Cookie` is on `api-staging.206.events`;
   `GET https://api-staging.206.events/auth/me` returns 200 (no CORS error);
   favorites/lists load.
4. Confirm isolation: favorites saved on the preview do **not** appear on
   `https://206.events`, and vice-versa.
5. Confirm prod login on `https://206.events` is unchanged.
