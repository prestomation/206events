# In-App User Feedback

Lets anyone on 206.events send feedback, report a problem with a source, or
suggest a new source from inside the app. Each submission is filed as a
**GitHub issue** on `prestomation/206events` — the same surface where bug
reports and source requests already live (see the "Filing an Issue" section of
the README).

Before this, the only feedback channels were GitHub Issues links buried in the
README; a typical visitor never saw them.

## Flow

```
Web UI (FeedbackModal) ──POST /feedback──▶ favorites-worker ──GitHub REST──▶ Issue
```

1. The user opens the modal from the **You** view ("Send feedback" /
   "Suggest a source") or from a **Channel** page ("Report a problem with this
   source", which pre-fills the source name / feed URL).
2. The modal POSTs JSON to the favorites worker's `/feedback` route with
   `credentials: 'include'`.
3. The worker validates + spam-checks the submission, then creates a labeled
   GitHub issue using a server-side token. The token never reaches the browser.

If `VITE_FAVORITES_API_URL` is unset (local/preview with no worker), the modal
falls back to opening GitHub's "new issue" page in a new tab.

## Request / response

`POST /feedback`

```jsonc
{
  "type": "general" | "bug" | "source",   // required
  "message": "string",                      // required, 1..5000 chars
  "email": "you@example.com",               // optional, opt-in only
  "context": {                               // optional
    "sourceName": "Stoup Brewing",
    "icsUrl": "stoup_brewing-all-events.ics",
    "pageUrl": "https://206.events/#..."
  },
  "website": ""                              // honeypot — must be empty
}
```

Responses: `200 {ok:true}` on success (and on honeypot trips, so bots get no
signal); `400` invalid input; `429` rate-limited; `502` GitHub API failure;
`503` feedback not configured (token/repo missing). The created issue URL is
intentionally **not** returned to anonymous callers.

## Privacy

The destination is a **public** GitHub repo, so:

- **Email is strictly opt-in.** It is taken only from the form body. A signed-in
  user's account email is **never** read from the session or posted — the worker
  only records a non-identifying `Account: signed-in` trust signal. The modal
  pre-fills the email field for signed-in users (editable, clearable) and warns
  that anything entered becomes public.
- The free-text message is rendered inside a fenced code block in the issue, so
  it can't inject markdown, mass-mention users (`@org/team`), or auto-link/close
  issues (`#123`). Short metadata fields are individually neutralized.

## Spam protection

Defense in depth, all in `infra/favorites-worker/src/feedback.ts`:

1. **Honeypot** — a hidden, non-tabbable `website` field; any value ⇒ silently
   dropped with a `200`.
2. **Per-IP rate limit** — at most 5 submissions/hour/IP, counted in the
   `RATE_LIMIT` KV namespace with a matching TTL. **Fails open** when the
   binding is absent, so a missing namespace never swallows all feedback.
3. **Validation** — type allowlist, message/email/context length caps, email
   format check.
4. **Markdown neutralization** — see Privacy above.

### Future hardening (deferred, non-blocking)

These were considered and intentionally left out of v1 to keep it reviewable.
The endpoint ships with honeypot + per-IP rate limit + validation; reach for
these **only when spam actually appears** (watch the `feedback`-labelled issue
volume). Each entry below carries enough context to implement in a single PR
without re-deriving the design. All worker changes land in
`infra/favorites-worker/src/feedback.ts` (+ `types.ts`, `wrangler.toml`, and
`test/feedback.test.ts`) unless noted.

#### 1. Cloudflare Turnstile (strongest lever — do this first)

A privacy-friendly, same-vendor CAPTCHA. Invisible/managed challenge most of the
time, so UX cost is low; it's free.

- **When:** the first sign of real bot spam getting past the honeypot.
- **Client** (`web/src/redesign/FeedbackModal.jsx`): load
  `https://challenges.cloudflare.com/turnstile/v0/api.js`, render a widget with
  the **public site key** from `import.meta.env.VITE_TURNSTILE_SITE_KEY`, and on
  submit include the widget token in the POST body as `turnstileToken`. Reset the
  widget on error. Keep the existing GitHub-URL fallback for when `API_URL` is
  unset.
- **Worker** (`handlePostFeedback`, before the rate-limit/issue-create step):
  add a `verifyTurnstile()` helper that POSTs to
  `https://challenges.cloudflare.com/turnstile/v0/siteverify` with
  `secret=TURNSTILE_SECRET`, `response=<token>`, `remoteip=<CF-Connecting-IP>`,
  and returns `403` when `success !== true`. **Gate on config:** if
  `TURNSTILE_SECRET` is unset, skip verification (so local/dev and the current
  deploy keep working) — i.e. fail-open until the secret exists, fail-closed once
  it does.
- **Config:** add `TURNSTILE_SECRET?: string` to `Env` in `types.ts`;
  `wrangler secret put TURNSTILE_SECRET`; set `VITE_TURNSTILE_SITE_KEY` at web
  build time. Create the Turnstile widget in the Cloudflare dashboard for the
  `206.events` domain.
- **Tests:** worker test stubs `fetch` for siteverify (success + failure →
  200/403); web test mocks the widget script and asserts the token is sent.
- **Tradeoff:** one third-party script + one verification round-trip per submit.

#### 2. Global (per-repo) rate limit — backstop against distributed abuse

The per-IP limit (5/hr) doesn't stop a botnet or VPN-rotated flood. Add a second
counter that caps **total** submissions per hour.

- **When:** if you see many issues from many distinct IPs in a short window.
- **How:** in `withinRateLimit()` (or a sibling checked alongside it), also
  increment a **time-bucketed global key** so each window is a fresh key that
  self-expires:
  `rl:feedback:global:${Math.floor(Date.now() / 3_600_000)}`, with
  `expirationTtl` ~2h. Add a `GLOBAL_RATE_LIMIT_MAX` constant (start ~100/hr).
  Over the cap → `429`. Reuse the existing `RATE_LIMIT` KV namespace.
- **Tests:** loop >`GLOBAL_RATE_LIMIT_MAX` submissions from varied IPs → `429`.
- **Tradeoff / caution:** this is a soft cap that an attacker can deliberately
  exhaust to *deny feedback* to legitimate users for the rest of the hour. Keep
  the cap generous and pair it with Turnstile (#1) rather than relying on it
  alone. The KV read-modify-write is non-atomic (same documented limitation as
  the per-IP counter and the favorites store) — acceptable for a backstop.

#### 3. Cloudflare-origin trust for `CF-Connecting-IP`

The rate-limit key trusts `CF-Connecting-IP`. Today that's safe: the worker is
bound **only** to the `api.206.events` custom-domain route (`wrangler.toml`
`routes`), so every request arrives through Cloudflare, which sets that header.
The risk only materializes if the worker ever gains a second, non-Cloudflare
entry point (e.g. a `*.workers.dev` route) where a client could spoof the header
to dodge the per-IP limit.

- **When:** revisit if a `workers.dev` or any non-custom-domain route is ever
  added.
- **How:** keep `workers.dev` disabled (set `workers_dev = false` in
  `wrangler.toml`) so only the custom domain serves; optionally require a shared
  secret header injected by a Cloudflare rule and reject requests missing it.
  Consider tightening the current `'unknown'` IP fallback (when the header is
  absent) from "all share one bucket" to an outright reject.
- **Tradeoff:** none meaningful while the single-route invariant holds — this is
  mostly a "don't regress the invariant" note plus the one-line `workers_dev`
  guard.

#### Reporting note

If any of these introduces a new user-visible rejection class worth tracking
(e.g. a Turnstile-failure counter), remember the **Reporting Parity** rule in
AGENTS.md — plumb it through every reporting surface in the same PR. A simple
403/429 bump generally doesn't warrant a new `build-errors.json` category.

## Setup (maintainer, one-time)

The endpoint returns `503` until both are configured:

1. **GitHub token** — create a **fine-grained PAT** scoped to *Issues:
   read & write* on `prestomation/206events` only, then:
   ```sh
   cd infra/favorites-worker
   wrangler secret put FEEDBACK_GITHUB_ISSUES_TOKEN
   ```
   (The secret can't use a `GITHUB_` prefix — that range is reserved.
   `GITHUB_REPO` is already set in `wrangler.toml` `[vars]`.) A GitHub App
   installation token is a lower-maintenance alternative if PAT expiry becomes a
   chore.
2. **Rate-limit KV namespace** (optional but recommended):
   ```sh
   wrangler kv namespace create RATE_LIMIT
   ```
   Paste the returned id into the commented `RATE_LIMIT` block in
   `wrangler.toml` and uncomment it, then redeploy.

The worker redeploys automatically on push to `main` touching
`infra/favorites-worker/**` (`.github/workflows/deploy-favorites-worker.yml`).

## Code map

| Concern | File |
|---|---|
| Worker route + validation + GitHub call | `infra/favorites-worker/src/feedback.ts` |
| Route registration | `infra/favorites-worker/src/index.ts` |
| Env bindings (`FEEDBACK_GITHUB_ISSUES_TOKEN`, `GITHUB_REPO`, `RATE_LIMIT`) | `infra/favorites-worker/src/types.ts`, `wrangler.toml` |
| Worker tests | `infra/favorites-worker/test/feedback.test.ts` |
| Modal UI | `web/src/redesign/FeedbackModal.jsx` |
| App-context wiring (`openFeedback` / `closeFeedback`) | `web/src/redesign/App206.jsx` |
| Entry-point buttons | `web/src/redesign/views.jsx` (YouView, ChannelDetail) |
| Modal styles | `web/src/index.css` (`.a-modal*`, `.a-hp`) |
| Web tests | `web/src/redesign/FeedbackModal.test.jsx` |
