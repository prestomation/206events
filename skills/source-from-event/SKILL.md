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
| **(d) Venue not covered AND the venue is self-managed with its own events page** (Neumos, Burke Museum, a specific brewery, etc.) | Source to add = **the venue**. Go to step 4 with the venue's events page as the candidate URL. |
| **(e) Venue not covered AND the venue is a shared/public space** (a park, plaza, civic center) | Source to add = **the promoter/organization named on the poster**, NOT the venue. Err on the side of adding (per project guidance). Go to step 4 with the promoter's events page as the candidate URL. |

If the poster is a true one-off (no recurring promoter and no
self-managed venue calendar), reply *"no viable recurring source for
this event"* and stop.

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

Delegate the add-source path to **`skills/source-discovery/SKILL.md`**
starting at its **Step 4 ("Quality gate each candidate")** — you have
already done the discovery; you have the candidate URL/venue in hand.
That skill handles:

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
