# Secrets Management & Scanning

This repo is public, so anything committed is permanently visible. Two habits
keep credentials out of it, and two automated layers enforce them.

## How secrets used to leak

1. **Captured fixtures.** Ripper unit tests use `sample-data.html` / `.json`
   fixtures saved from live third-party pages. Those pages embed the *site's own*
   client-side API keys (Google Maps, Algolia, Datadog, reCAPTCHA, OAuth client
   IDs, …). Saving the page verbatim committed those keys, even though no ripper
   ever reads them. Public secret scanners flag such keys against this repo.
2. **Hardcoded source credentials.** A few rippers need a key to fetch their API
   (a search-only Algolia key, a Supabase anon key, a Sitecore read key). These
   were hardcoded as constants. Even though they're public/read-only by design,
   they read as committed secrets.

## What we do instead

### Fixtures — scrub on the way in
Redact any embedded credential to an obvious placeholder (e.g.
`AIza-REDACTED-EXAMPLE-KEY`) before committing a fixture. The parser only needs
the structural event data. If a fixture is unused (e.g. a `sample-data.html`
that's been superseded by `sample-data.json`), delete it. See the "Sample Data"
section of `AGENTS.md`.

### Source credentials — environment, not source
Read every source credential from `process.env.<SOURCE>_<NAME>`. Mirror the guard
in `lib/config/ticketmaster.ts`: if the env var is missing, return the calendars
with a per-calendar `ParseError` ("…environment variable is not set") and zero
events — never throw, never fall back to a hardcoded literal. The value lives in:

- a **GitHub Actions repo secret**, referenced from the `Generate calendars`
  step's `env:` block in `.github/workflows/build-calendars.yml`, and
- each developer's local **`.env`** (gitignored), with a placeholder line in
  `.env.example`.

Current source-credential env vars:

| Source | Env var | Notes |
|---|---|---|
| `candlelight` | `CANDLELIGHT_ALGOLIA_API_KEY` | Search-only Algolia key |
| `pioneer_square_market` | `PIONEER_SQUARE_MARKET_ANON_KEY` | Supabase anon (read-only) key |
| `benaroya_hall` | `BENAROYA_SITECORE_API_KEY` | Sitecore read-only Item Service key |

Because the secret has to be added to GitHub by the maintainer, a source that
needs a new credential reports zero events in CI until the secret exists. When
adding such a source, call this out in the PR body and the chat report (see
`skills/source-discovery/SKILL.md` step 6a).

## Enforcement (defense in depth)

1. **CI** — `.github/workflows/secret-scan.yml` runs
   [gitleaks](https://github.com/gitleaks/gitleaks) on every PR and push to
   `main`. On PRs it scans only the PR's commits, so pre-existing history isn't
   re-flagged. Config: `.gitleaks.toml`.
2. **Pre-commit** — `scripts/git-hooks/pre-commit` runs
   `gitleaks protect --staged` before each commit. Installed by pointing git at
   the hooks dir: `npm run setup-hooks` (also wired into the `prepare` lifecycle,
   so `npm install` sets it up). If gitleaks isn't installed locally, the hook
   no-ops with a notice and CI remains the backstop.
3. **Native GitHub (recommended, manual)** — enable **Settings → Code security →
   Secret scanning + Push protection**. Push protection blocks a push containing
   a recognized secret before it lands — the earliest possible guard. This is a
   repo setting, not configured in code.

Run a scan locally any time:

```sh
gitleaks detect --redact -c .gitleaks.toml      # whole tree
gitleaks protect --staged --redact -c .gitleaks.toml   # staged changes only
```

## Allowlisting

`.gitleaks.toml` allowlists only redacted placeholders and test dummies. Do not
allowlist `sample-data.*` paths — scanning fixtures is the whole point. If a real
public, non-secret identifier false-positives, add a narrow regex entry with a
comment explaining why it's safe.
