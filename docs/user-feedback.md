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

**Cloudflare Turnstile** is a recommended future hardening if the honeypot +
rate limit prove insufficient against anonymous→Issues spam; it was left out of
v1 to keep the change reviewable.

## Setup (maintainer, one-time)

The endpoint returns `503` until both are configured:

1. **GitHub token** — create a **fine-grained PAT** scoped to *Issues:
   read & write* on `prestomation/206events` only, then:
   ```sh
   cd infra/favorites-worker
   wrangler secret put GITHUB_TOKEN
   ```
   (`GITHUB_REPO` is already set in `wrangler.toml` `[vars]`.) A GitHub App
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
| Env bindings (`GITHUB_TOKEN`, `GITHUB_REPO`, `RATE_LIMIT`) | `infra/favorites-worker/src/types.ts`, `wrangler.toml` |
| Worker tests | `infra/favorites-worker/test/feedback.test.ts` |
| Modal UI | `web/src/redesign/FeedbackModal.jsx` |
| App-context wiring (`openFeedback` / `closeFeedback`) | `web/src/redesign/App206.jsx` |
| Entry-point buttons | `web/src/redesign/views.jsx` (YouView, ChannelDetail) |
| Modal styles | `web/src/index.css` (`.a-modal*`, `.a-hp`) |
| Web tests | `web/src/redesign/FeedbackModal.test.jsx` |
