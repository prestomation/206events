# 206.events Source-from-Event

Given an **event** — described by a poster image, a text request, or
both — check whether 206.events already covers it, fix any parser gap
that prevents it from showing up, or add a new source that would cover
it. The end result is either "already covered, done" or a draft PR
adding a new source through the usual automated review-and-merge flow.

## When to use

**This skill is the default handler for any image attachment in a
206.events session** — posters are the only image workflow this repo
has, so any image should be treated as a poster unless clearly
otherwise.

It also handles **text requests** that describe an event the user wants
covered:

- "please add this event: <name> at <venue> on <date>"
- "we should cover X"
- "find a source for this event"
- "is X already in 206.events? if not add it"

## Inputs

Either or both of:

1. **One or more poster images** attached to the message. Read each
   with the `Read` tool — you are multimodal; no OCR step is needed.
2. **A text description** of an event (free-form). Extract the same
   fields you would from a poster.

## Steps

### 1. Extract event details

For each poster image, extract a structured record. **Pull a list of
plausible title queries, not a single string** — most posters present
multiple billable strings:

- Headliner / billed title (`PHOEBE BRIDGERS`)
- Tour or series name (`ISOLATION TOUR`, `KEXP Concerts at the Mural`)
- Each supporting act (`MUNA`, `Christian Lee Hutson`) — pass each as
  a separate `--title`; openers often appear in event descriptions,
  not summaries
- Promoter / "presented by" line
- Venue name and address
- Date and start time
- Any URLs printed on the poster (event page, ticketing, venue site)
- Genre/format hints (e.g. comedy, makers market, gallery opening) to
  help reason about which source-type to add later

**If anything critical is unreadable (date, venue), ask the user to
confirm** before proceeding. A wrong venue extraction routes the rest
of the flow to the wrong answer. Use `AskUserQuestion`.

For text-only requests, parse the same fields out of the user's
description. Ask for clarification on anything missing.

### 2. Search production data

Run **`skills/event-lookup/`** with every extracted query:

```bash
bash skills/event-lookup/scripts/fetch-data.sh
python3 skills/event-lookup/scripts/search-events.py \
    --title "<headliner>" \
    --title "<opener>" \
    --title "<tour name>" \
    --venue "<venue name>" \
    --venue "<promoter>" \
    --date YYYY-MM-DD \
    --url "<any poster URL>"
```

Read the resulting `title_only_matches` first, then `event_candidates`,
then `source_candidates`, then `venue_candidates`. Decide what's
actually a match per the guidance in `skills/event-lookup/SKILL.md`
step 3.

### 3. Decide the outcome

Five branches. Pick exactly one per event.

| Situation | Action |
|---|---|
| **(a) Event found in `event_candidates` or `title_only_matches`** | Reply: *"This event is already covered by `<source.friendly>` (kind: `<source.kind>`, ics: `<icsUrl>`)."* No PR. **Stop.** |
| **(b) Event missing AND a matching source has a ParseError near that date in `build-errors.json`** | The ripper is broken for items like this. Hand off to **`skills/build-report/SKILL.md`** to fix the parser. The fix is a separate PR. Do not also add a new source for the same venue. |
| **(c) Venue covered, event missing, no parse error** | Reply: *"Covered by `<source>` — event has likely not surfaced upstream yet (too far ahead, or not yet posted)."* No PR. **Stop.** |
| **(d) Venue not covered AND the venue is self-managed with its own events page** (Neumos, Burke Museum, a specific brewery, etc.) | Source to add = **the venue**. Go to step 3.5 (and 3.5a if no structured platform turns up) to find the events page or Instagram account, then step 5. |
| **(e) Venue not covered AND the venue is a shared/public space** (a park, plaza, civic center) | Source to add = **the promoter/organization named on the poster**, NOT the venue. Err on the side of adding (per project guidance). Go to step 3.5 (and 3.5a if no structured platform turns up) to find the events page or Instagram account, then step 5. |

If the poster is a true one-off (no recurring promoter and no
self-managed venue calendar, and no active Instagram presence per
step 3.5a), reply *"no viable recurring source for this event"* and stop.

### 3.5. Find the org's events page (branches d and e only)

You now have an org or venue name but may not have a URL. **Always search
the web before delegating to source-discovery** — source-discovery's
live-fetch validation step requires an actual URL.

```
WebSearch: "<org name> Seattle events calendar"
WebSearch: "<org name> Seattle tickets Eventbrite Humanitix OvationTix Ticketmaster DICE Universe"
WebSearch: "site:<domain> events"   # once you have a domain
```

From the search results, determine:

1. **The org's canonical events or "what's next" page URL.** This is your
   candidate URL for step 5. If multiple URLs surface (e.g., an Eventbrite
   organizer page *and* a self-hosted events page), prefer the self-hosted
   page as the candidate — it's more stable and already aggregates all
   ticketing. If the org uses a single platform exclusively, use that
   platform URL.
2. **The ticketing platform** (Eventbrite, Humanitix, OvationTix,
   Ticketmaster, DICE, Universe, etc.). The platform determines
   implementation strategy — check `AGENTS.md` for built-in ripper types
   before writing a custom one.
3. **Whether the org is a viable recurring source.** An org that posts
   events via a structured platform (any of the above) is viable. Before
   concluding otherwise, always check Instagram (step 3.5a) — many small
   or itinerant orgs (a speed-dating night, a trivia host, a scavenger-hunt
   crew) have no ICS/API/self-hosted calendar at all and post exclusively
   as Instagram flyers. Only an org with **no** structured platform *and*
   no active Instagram presence is not viable — reply accordingly and stop.

**If initial searches return nothing useful:** try alternative terms
(`"<org name> site:eventbrite.com"`, `"<org name> tickets"`, the org's
social media bio link), then check `docs/source-candidates/` for a prior
investigation. If still nothing, go to step 3.5a before concluding not
viable — do not guess at URLs.

Fetch the events page (`WebFetch`) to confirm it returns real event data
before proceeding. If it returns a 503 or requires JS rendering, note
the proxy rung needed (see `AGENTS.md` proxy ladder).

### 3.5a. Instagram-only orgs (no ICS/API/self-hosted calendar found)

Many posters name an org whose *only* public presence is an Instagram
account (the handle is often printed directly on the poster, e.g. "Find
more events @handle"). This is a first-class, viable source path — **do
not fall through to "no viable recurring source" without checking it.**

1. Confirm the account is real and active before doing anything else:
   ```bash
   curl -sS -H 'X-IG-App-ID: 936619743392459' -H 'Sec-Fetch-Site: same-origin' \
     'https://i.instagram.com/api/v1/users/web_profile_info/?username=<handle>'
   ```
   A `200` with a `biography`, non-empty `edge_owner_to_timeline_media.edges`,
   and `is_private: false` confirms it's a live, public, active account —
   viable. A private account, a 404, or an empty/stale post list is not
   viable (note it and move on; don't try to work around privacy).
2. **This is a distinct implementation path from step 5 / source-discovery.**
   Skip source-discovery's live-fetch-a-URL validation — there is no
   ICS/API/HTML page to validate, only a stream of posts. Instead hand off
   directly to **`skills/instagram-source/SKILL.md`**, which:
   - adds `sources/<slug>/ripper.yaml` with `type: instagram` (see that
     skill's "Adding another Instagram account" section for the exact
     shape — `geo: null` for a multi-venue/itinerant org, a `{lat,lng}`
     for a single fixed venue),
   - reads recent posts' flyer images (vision, not caption-only) to seed
     real events into `instagram-cache.json`,
   - flips `disabled: true` off once real events are recorded,
   - and opens the PR through the normal flow (draft → code review →
     auto-merge per `AGENTS.md`).
3. If you already have the poster's own flyer image and it corresponds to
   one of the account's recent posts, that image can seed the first cache
   entry directly — but still fetch the account's other recent posts so
   the new source launches with more than one event.

Only fall through to "no viable recurring source" (end of step 3) after
**both** a structured-platform search (3.5) **and** an Instagram check
(3.5a) have come back empty.

### 4. Check for parse gaps (branch b)

Before committing to "broken parser":

```bash
python3 skills/build-report/scripts/build-health.py
```

Inspect `sources[].errors` for the matched ripper. If a `ParseError`
mentions the poster's date or title fragment, that's a confirmed gap.
Hand off to `skills/build-report/SKILL.md` for the fix.

If no ParseError matches, treat as branch (c) — likely just not yet
published.

### 5. Add a new source (branches d, e)

Two implementation paths, depending on what step 3.5/3.5a found:

**Structured platform found (ICS/API/self-hosted calendar/Eventbrite etc.)**
— delegate to **`skills/source-discovery/SKILL.md`** starting at its
**Step 4 ("Quality gate each candidate")** — you have already done the
discovery (steps 2–3.5); you have the candidate URL/venue in hand. That
skill handles:

- Live fetch validation of the candidate URL
- Writing `docs/source-candidates/<slug>.md` (record this came from a
  poster lookup in the body)
- Spawning a coding agent to implement the ripper / add the external
  ICS / configure the built-in type
- Pushing to a feature branch and opening a **draft PR**
- Subscribing to PR activity, iterating with Amazon Q until clean
- Flipping the PR to ready, enabling auto-merge, merging on green

**Do not skip the live-fetch validation.** A poster lookup that
identifies a Seattle band's website as the candidate source is still
just a candidate — the URL needs to actually return event data before
implementation.

**Instagram-only org (no structured platform, per step 3.5a)** —
delegate to **`skills/instagram-source/SKILL.md`** directly instead of
source-discovery. Still write `docs/source-candidates/<slug>.md` noting
this came from a poster lookup and that the implementation is
`type: instagram`. Still push to a feature branch, open a draft PR, and
run it through the same code-review → auto-merge flow — only the
discovery/validation step differs (a confirmed active Instagram account
stands in for a live-fetched URL).

### 6. Reply

One concise message covering each event in the input. For each:

- **(a)** found: name the source and `icsUrl`. Done.
- **(b)** parse gap: link the build-report PR (or note it was handed off).
- **(c)** venue covered, event not yet surfaced: name the source.
- **(d)/(e)** new source being added: link the draft PR and the
  candidate file path. State that it will auto-merge once CI + Amazon Q
  pass.
- One-off, no source possible: say so plainly.

## Important rules

- **Always search production data first.** Never decide coverage by
  scanning `sources/` in the repo — aggregator rippers (`19hz`,
  `ticketmaster`, `seattle-showlists`) cover venues the directory
  listing won't reveal.
- **Cast a wide net, then read carefully.** The lookup script returns
  fuzzy candidates with score breakdowns. A high score does not mean
  "found"; a low score with the right summary text might. You are the
  judge.
- **Pass every plausible title from the poster.** Headliner, openers,
  tour name, series name — each as a separate `--title`. The script
  takes the best score across all of them.
- **For shared venues, add the promoter, not the venue.** A park
  doesn't have an event calendar; the org running the event in the
  park does.
- **Err on the side of adding** when the venue/promoter clearly hosts
  a continuing series of events. The project's `source-discovery`
  skill states the goal explicitly: any working Seattle source is
  better than no source.
- **One source per poster.** If a poster names a venue + promoter +
  three bands, add the most likely *recurring* source — usually the
  venue or the promoter — not all of them.
- **Confirm ambiguous extractions** with the user before proceeding.
  Vision can misread stylized fonts; better to ask once than to add
  the wrong source.
- **Always open a draft PR**, never push to main. The repo's PR
  workflow (Amazon Q review → auto-merge on green) handles the rest.
