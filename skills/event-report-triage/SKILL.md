---
name: event-report-triage
description: Triage an in-app "Report a problem" feedback issue about a specific published event. Assume the published event is wrong, verify every field against the live source, identify the discrepancy, and fix it via the appropriate channel (parser PR, uncertainty-cache, or duplicate-cache).
---

# Event Report Triage

Handle a **feedback report about an event that 206.events already
publishes** — the issues opened by the in-app "Report a problem" button
(labelled `feedback` + `bug`, e.g. a title like
`[Bug] <event name>`). This is **not** `source-from-event` (which *adds*
coverage for an event we don't have). This skill starts from an event we
*do* publish and asks: **what did we get wrong about it?**

## The one rule that matters

**A report means our data is wrong until proven otherwise.** Someone was
looking at the event on the site, saw something off, and took the trouble
to report it. Treat that as ground truth that a discrepancy exists — then
go find it.

**Never** conclude "no actionable bug" because:

- the free-text "Problem with …" field is **empty** (the form makes it
  optional; most reporters leave it blank), or
- the title/date *look* plausible in isolation, or
- you cannot reach the source host from your current environment.

The report itself is the signal. An empty description means *"go compare
our copy against reality and find the discrepancy yourself,"* not *"there
is nothing to do."* Closing one of these as not-actionable without having
diffed against the live source is the failure mode this skill exists to
prevent.

## What the issue gives you

The feedback issue body is auto-generated and contains structured fields:

- **Event** — the exact `summary` we published
- **Date** — the human-facing date/time we published (this is the field
  most often *wrong*)
- **Source** — the friendly source name (e.g. `Book Larder`)
- **Calendar feed** — the `.ics` filename (e.g.
  `book-larder-all-events.ics`) → maps to a `sources/<name>/` directory
- **Page** — a `206.events/#event=…` deep link whose fragment encodes the
  published `summary|<ISO date>[America/Los_Angeles]` key

Parse these out first — they tell you which ripper produced the event and
exactly which published values to check.

## Steps

### 1. Reconstruct what we published

From the issue fields, note our published `summary`, `date`/`time`,
`location`, and source. If useful, cross-check against the published
`events-index.json` via **`skills/event-lookup/`** to pull the full record
(price, image, `duplicateGroupId`, geo) we're serving.

### 2. Find the live source of truth

Identify the real upstream event and pull its authoritative details.
Prefer, in order:

1. The **source's own page** for this event (the ripper's `url` / the
   event's `url`).
2. The **actual venue or organizer** page — reports frequently involve
   **off-site events** (a bookstore hosting an event *at a theater*), so
   the ripper's home venue is often **not** where the event happens.
3. Ticketing / press / listings pages.

**When the source host is blocked from your environment** (egress policy
403, common for `booklarder.com`, `thetripledoor.net`, and `206.events`
itself in sandboxed sessions), **`WebSearch` is the fallback** — it
routes differently and usually gets through where `WebFetch`/`curl` are
denied. Search the event name + venue + date and read the corroborating
listings. Do **not** give up because the primary host 403s; a blocked
host is a reason to switch channels, not to close the report.

If you genuinely cannot verify from any channel, say so explicitly and
hand off (see step 5) — do not silently drop it.

### 3. Diff every field, not just the reported one

Compare our published record against the verified live event across **all**
of these — the reporter often flags one symptom while several fields are
wrong:

| Field | What to check |
|---|---|
| **Start time** | Did the ripper parse a real time, or default/guess one? A round time (e.g. exactly 6 PM) with no matching upstream time is a red flag. |
| **Date** | Off-by-one, wrong month/year, timezone slip. |
| **Location / venue** | **Is the event actually held where the ripper assumes?** Off-site events are the #1 cause of both wrong map pins *and* missed duplicates. |
| **Duplicate** | Is the same real-world event also published by another source (the actual venue, an aggregator)? If so, why didn't `cross-source-dedup.ts` merge them — usually because *our* wrong location/time defeated the distance/time signals. |
| **Multiple showings** | One upstream product with two seatings/showtimes must become **one event per showing** (deterministic slot-suffixed ids), not one. |
| **Price / image** | Missing or wrong vs. upstream. |

### 4. Fix through the right channel

Route each confirmed discrepancy to the correct mechanism — one PR per
concern where it makes sense:

- **Parser produced wrong/guessed data** (wrong time, wrong location,
  dropped showings) → fix the **ripper** and add a regression test.
  Hand off to **`skills/build-report/SKILL.md`** conventions (build a
  single source with `ONLY_SOURCE=<name> npm run generate-calendars`,
  fresh `sample-data` fixture, PR). A ripper that **guesses** a field it
  can't parse must instead emit an `UncertaintyError` (never publish a
  silent default) — see `docs/event-uncertainty.md`.
- **A specific field is unknown for this one event** (start time, cost,
  image, location) → resolve it into `event-uncertainty-cache.json` via
  **`skills/event-uncertainty-resolver/SKILL.md`**.
- **Confirmed cross-source duplicate the matcher missed** → add a
  `confirmed` decision to `event-duplicate-cache.json` via
  **`skills/duplicate-resolver/SKILL.md`**. Prefer fixing the root cause
  (the bad location/time that defeated the matcher) so dedup fires
  automatically; use the cache entry only when the merge is genuinely a
  judgment call the matcher can't reach.

### 5. Reply / close

Reply on the issue with what was wrong and the PR(s) that fix it. Only
close the issue as not-actionable when you have **actually verified** the
published event is correct against the live source and found no
discrepancy — and say which source you checked. "The description was
blank" is never, by itself, a reason to close.

## Important rules

- **Assume wrong, verify, then fix** — in that order. The report is
  evidence a defect exists.
- **A blocked source host is not a dead end** — fall back to `WebSearch`.
- **Check the whole record**, not just the one field the reporter named.
- **Off-site events** (venue-A source, held at venue-B) are the common
  root cause behind wrong times, wrong pins, *and* missed duplicates all
  at once — always confirm where the event is actually held.
- **Never publish a silent guess** — an unparsable field becomes an
  `UncertaintyError`, not a default that looks like a fact.
- **One PR per concern**; go through the normal draft-PR review-and-merge
  flow. Parser/infra fixes are manual-merge; cache resolutions
  (uncertainty, duplicate) follow their resolver skills' merge rules.
