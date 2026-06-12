# Claude Code Routines: the recommended automation set

The skills under `skills/` are the operating manual; **routines** are what
run them on a schedule so the site maintains itself. Routines are resources
in *your* Anthropic account (created in Claude Code, pointed at your repo) —
they are not files this repo can ship. The repo's **only** coupling to any
routine is the `trigger-error-routine` job in
`.github/workflows/publish_calendars.yml`, which fires one routine by id
when a daily build has errors.

This catalog documents the automation set the reference instance
(206.events) actually runs: four hooks. A copy is **self-maintaining** once
all four exist — see the operator journey in
[`city-template.md`](./city-template.md#operator-journey).

The prompts below are **suggested templates** — adjust wording, cadence,
and scope to taste when creating the routine in your account.

## Quick reference

| Hook | Trigger | Runs | Repo secrets needed |
|---|---|---|---|
| [Build-error responder](#1-build-error-responder) | Fired by `publish_calendars.yml` when a build has errors (≤ once per 24 h) | `skills/build-report/SKILL.md` | `CLAUDE_ROUTINE_ID`, `CLAUDE_ROUTINE_TOKEN` |
| [Daily source discovery](#2-daily-source-discovery) | Account-scheduled, daily | `skills/source-discovery/SKILL.md` steps 1–5 | none |
| [Daily source implementation](#3-daily-source-implementation) | Account-scheduled, daily | `skills/source-discovery/SKILL.md` steps 6–8 | none |
| [GitHub-issues responder](#4-github-issues-responder) | Issue-driven (feedback form + manual issues) | triage → the matching skill | none |

Only the build-error responder is wired to the repo at all; the other three
live entirely in your account and need no secrets or workflow changes.

## 1. Build-error responder

**Purpose:** drain `build-errors.json` — fix broken sources, resolve
geocode errors, and chain into the resolver skills (uncertainty, photos,
costs, proxy escalation). When the build is healthy it falls through to
source discovery, so even this one routine keeps a copy improving.

**Trigger & cadence:** fired by the repo, not a schedule. The
`trigger-error-routine` job in `.github/workflows/publish_calendars.yml`
calls the routine-fire API when a daily build finishes with errors,
rate-limited to once per 24 h (bypass with a manual workflow dispatch and
`force_routine=true`). See that job for the wire details; it skips
silently while the secrets are unset. Give the routine itself no schedule
(or a slow weekly one as a safety net).

**Suggested prompt:**

```
Read skills/build-report/SKILL.md and follow it completely.
```

**Secrets & repo coupling:** after creating the routine, copy its id and
token into the `CLAUDE_ROUTINE_ID` and `CLAUDE_ROUTINE_TOKEN` repo
secrets. This is the only hook that touches repo configuration.

**Without it:** build-error triage is manual — watch
`https://<your-domain>/build-errors.json` (or the Discord notification,
if enabled) and run `skills/build-report/SKILL.md` yourself when errors
appear.

## 2. Daily source discovery

**Purpose:** grow the catalog — scan for new event sources in your city,
quality-gate them, record candidates under `docs/source-candidates/`, and
flag dead sources.

**Trigger & cadence:** account-scheduled, daily.

**Suggested prompt:**

```
Read skills/source-discovery/SKILL.md and follow steps 1-5 (discovery and
candidate triage only - do not implement a source). Record new candidates
under docs/source-candidates/ and append today's discovery log.
```

**Secrets & repo coupling:** none.

**Without it:** the source catalog stops growing and dead sources go
unflagged until a human runs the skill.

## 3. Daily source implementation

**Purpose:** turn candidates into live calendars — pick the
highest-confidence candidate from `docs/source-candidates/` and implement
it as its own PR, following the quality gates.

**Trigger & cadence:** account-scheduled, daily (offset it a few hours
after the discovery routine so fresh candidates are available).

**Suggested prompt:**

```
Read skills/source-discovery/SKILL.md and follow it from step 6: pick the
highest-confidence existing candidate in docs/source-candidates/ and
implement that one source as a PR. Do not run the discovery scan.
```

**Secrets & repo coupling:** none.

**Without it:** candidates pile up in `docs/source-candidates/`
unimplemented.

## 4. GitHub-issues responder

**Purpose:** act on user feedback. The in-app feedback form files labeled
GitHub issues automatically (see [`user-feedback.md`](./user-feedback.md)),
and users also open issues by hand — bug reports, new-source requests,
stale-calendar reports. This hook triages them and turns them into PRs.

**Trigger & cadence:** issue-driven — use whatever issue-triggered
automation your setup supports (a Claude Code GitHub integration responding
to new issues, or an account-scheduled routine that sweeps open issues
daily).

**Suggested prompt:**

```
List the open GitHub issues on this repo that have no linked PR. Pick the
most actionable one. For a new-source request, follow
skills/source-discovery/SKILL.md (quality gates included). For a broken or
incorrect calendar, follow skills/build-report/SKILL.md conventions to fix
the ripper. For an event poster or "is X covered?" question, follow
skills/source-from-event/SKILL.md. Open a PR and comment on the issue with
the result.
```

**Secrets & repo coupling:** none for the routine itself. (The
`FEEDBACK_GITHUB_ISSUES_TOKEN` secret mentioned in the favorites-worker
setup is unrelated — it lets the *feedback form* file issues, not the
responder read them.)

**Without it:** feedback-form submissions and user issues sit until a
human triages them.
