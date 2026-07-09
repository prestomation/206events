---
name: social-discovery
description: Daily scan of social and community feeds (r/SeattleEvents, etc.) for new event sources not already covered by 206.events. Fetches RSS feeds, extracts external URLs, deduplicates against existing sources and candidates, and appends new finds to the discovery log and candidate files. Use when triggered by the daily cron or when asked to run social source discovery.
---

# 206.events Social Source Discovery

Scan social and community platforms (currently r/SeattleEvents, extensible to
other feeds) for posts linking to event sources we don't already cover.
Runs daily from the out-of-band environment (VPS) where Reddit's RSS feed is
accessible.

## When to run

Triggered by a daily cron job, or manually when asked to find new event sources
from social/community feeds.

## Current Sources

- **r/SeattleEvents** — `https://old.reddit.com/r/seattleevents/.rss` (Atom XML, 25 posts per fetch)
- Future: other subreddits, Facebook groups, Nextdoor, Meetup feeds, etc.

## Steps

### 1. Pull Latest Code

```bash
cd /root/.openclaw/workspace-calendar/repo && git pull origin main
```

### 2. Fetch and Parse Feeds

Run the fetch script to get new posts from all configured social sources:

```bash
python3 skills/social-discovery/scripts/fetch_reddit.py \
  --repo /root/.openclaw/workspace-calendar/repo \
  --state /root/.openclaw/workspace-calendar/repo/.social-discovery-state.json
```

The script:
- Fetches `https://old.reddit.com/r/seattleevents/.rss` (Atom XML, 25 posts)
- Extracts external URLs from each post's HTML content
- Classifies URLs by platform (Eventbrite, NeonCRM, TicketSpice, etc.)
- Filters out social media links, content sites, and Reddit internals
- Tracks seen post IDs in `.social-discovery-state.json` so only new posts are processed
- Outputs JSON with `candidates` array

**Rate limiting:** Reddit allows ~1-2 requests per IP before returning HTTP 429.
The daily cron fires once, so this is not a problem. If you get 429, wait 60
seconds and retry. Do NOT run the script multiple times in quick succession.

### 3. Deduplicate Against Existing Sources

For each candidate URL from the script output, check if we already cover it:

1. **Check `sources/` directory** — `ls sources/` and look for a matching slug
2. **Check `sources/external/` directory** — `ls sources/external/` for ICS feeds
3. **Check `docs/source-candidates/`** — `ls docs/source-candidates/` and look
   for an existing candidate file (read frontmatter `status:` — if `added` or
   `candidate`, it's already known)

Skip any URL that maps to an already-covered or already-evaluated source.

### 4. Evaluate and Classify New Candidates

For each **new** URL (not in sources, not in candidates), evaluate:

- **Is it a recurring event source?** (venue calendar, organizer page, recurring
  event series) → good candidate
- **Is it a one-off event?** (single Eventbrite event link, one-time festival) →
  skip, not worth a dedicated source. But note the platform — if it's
  Eventbrite, check if the organizer has more events.
- **Is it a content/blog site?** (secretseattle.co, seattlerefined.com) → skip,
  these are content aggregators, not event sources
- **What platform is it?** — Eventbrite (extract organizer ID), NeonCRM,
  TicketSpice, Squarespace, custom HTML, etc.

For Eventbrite single-event links (`eventbrite.com/e/...`), try to extract the
organizer by visiting the event page or checking the organizer's profile at
`eventbrite.com/o/<org-id>`. Only add as a candidate if the organizer has
**5+ upcoming events** (per AGENTS.md rule).

### 5. Write Candidate Files

For each viable new source, create a file in `docs/source-candidates/`:

```markdown
---
name: <Venue/Org Name>
status: candidate
platform: <Eventbrite / NeonCRM / Unknown / etc.>
url: <URL>
tags: [<relevant tags>]
firstSeen: <YYYY-MM-DD>
lastChecked: <YYYY-MM-DD>
---

Discovered via r/SeattleEvents post: <post_url>
Post title: "<post title>"
Post date: <YYYY-MM-DD>

<Notes about the source — what platform, how many events, etc.>
```

Follow the naming convention from `docs/source-candidates/README.md`: slug is
the name lowercased with non-alpha runs collapsed to `-`.

### 6. Update Discovery Log

Create or append to `docs/discovery-log/YYYY-MM-DD.md`:

```markdown
## Social source discovery: r/SeattleEvents

- 💡 Candidate: <name> — <platform> — <URL> (via [Reddit post](<post_url>))
- ❌ Skipped (one-off): <name> — single Eventbrite event
- ❌ Skipped (already covered): <name> — in sources/<slug>/
- ❌ Skipped (already candidate): <name> — in docs/source-candidates/<slug>.md
```

### 7. Commit and Open PR

```bash
cd /root/.openclaw/workspace-calendar/repo
git checkout -b chore/social-discovery-YYYY-MM-DD
git add docs/source-candidates/ docs/discovery-log/ .social-discovery-state.json
git commit -m "Social source discovery: YYYY-MM-DD — N new candidates"
git push origin chore/social-discovery-YYYY-MM-DD
```

Then open a PR via `scripts/push_and_pr.sh` or `gh pr create`.

### 8. Report

Post a summary to the channel:

```
🔍 Social Source Discovery (r/SeattleEvents)
  Feed: 25 posts (N new since last run)
  💡 New candidates:
    1. <name> — <platform> — <URL>
    2. <name> — <platform> — <URL>
  ❌ Skipped: N (already covered / one-off / content site)
  PR: <PR URL>
```

If no new candidates were found:
```
🔍 Social Source Discovery (r/SeattleEvents)
  Feed: 25 posts (0 new since last run)
  No new candidates this run.
```

## Important Rules

- **One request per feed per run** — social platforms rate-limit aggressively.
  The script makes exactly one HTTP request per feed. Do not run it multiple
  times in quick succession.
- **State file is git-tracked** — `.social-discovery-state.json` is committed
  so the next run knows which posts were already processed. Don't delete it.
- **Skip one-off events** — A single Eventbrite event link is not a source. But
  check the organizer — if they have 5+ recurring events, the organizer is the
  source, not the individual event.
- **Skip content sites** — secretseattle.co, seattlerefined.com, etc. are blogs
  about events, not event sources with structured data.
- **Skip social media links** — Facebook event pages, Instagram posts, etc. are
  not scrapable event sources.
- **Check existing candidates first** — `ls docs/source-candidates/` before
  creating a new file. If a candidate already exists, just update `lastChecked`
  and add a note about the sighting.
- **One PR per run** — bundle all candidate files and the discovery log entry
  into a single PR.
- **Don't implement sources here** — this skill only discovers and documents
  candidates. Implementation is handled by the source-discovery skill
  (`skills/source-discovery/SKILL.md`), which picks up candidates and builds
  rippers.