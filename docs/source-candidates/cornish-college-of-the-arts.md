---
name: "Cornish College of the Arts"
status: candidate
platform: Seattle University Localist (JSON API, numeric group_id filter)
url: https://events.seattleu.edu/group/cornish-college-of-the-arts
tags: [Arts, Music, Theatre]
firstSeen: 2026-05-08
lastChecked: 2026-06-07
---

Cornish merged into Seattle University; its public event calendar is now a
Localist group on SU's instance (`https://events.seattleu.edu`).

**Correction to the prior `notviable` finding (2026-05-13):** the earlier
conclusion was that the `groups=cornish-college-of-the-arts` *slug* filter and
the `.../calendar/cornish-college-of-the-arts.ics` ICS export don't filter
properly (446 mixed Cornish + SU events). That's true for the slug/ICS path,
but the **JSON API filters correctly when given the numeric group id**:

```
https://events.seattleu.edu/api/2/events?group_id=50276813607690&pp=50&days=365
```

Numeric group id: **`50276813607690`** (found via `/api/2/groups`). Sanity
check on 2026-06-07: unfiltered instance = 43 upcoming events in 120d; the same
query filtered to `group_id=50276813607690` = 1. So a custom `JSONRipper`
against the Localist `/api/2/events` endpoint filtered by this numeric group id
would yield Cornish-only events — the prior blocker is solved.

**Why it's `candidate` and not implemented yet:** as of 2026-06-07 the Cornish
group has ~0 *listable* upcoming events (the API reports `total: 1` but returns
an empty `events` array — a phantom/unlisted instance). Summer academic lull;
the public-facing "Summer at Cornish" performances ticket through
`cornishtickets.ludus.com` (Ludus), which is **Cloudflare-blocked** (403 "Just
a moment..."), not the SU Localist instance. Adding the Localist source now
would create a 0-event pipeline, which the build rejects for new sources.

**Implement when:** the SU Localist Cornish group populates for the
fall/academic year (re-check the `group_id=50276813607690` query). Build as a
custom Localist `JSONRipper` (the existing `seattle-university` external feed
uses the whole-instance `calendar.ics` and does **not** surface Cornish group
events). Only add `expectEmpty: true` after the pipeline has produced events at
least once.

Surfaced again 2026-06-07 from a poster-board photo (source-from-event): a
"Summer at Cornish" poster on a community kiosk.
