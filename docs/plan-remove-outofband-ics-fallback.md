# Plan: Remove Option A ICS Re-Parse Fallback

## Background

PR #642 fixed a bug where `proxy: "outofband"` ripper events were invisible on
the website. It added two mechanisms:

- **Option B** (`outofband-events.json`): the outofband runner serializes full
  structured event data (cost, imageUrl, osmType/osmId, exact endDate) that the
  main build merges directly. Added in the follow-up commit on the same branch.
- **Option A fallback**: if `outofband-events.json` is absent (runner predates
  Option B), the main build falls back to re-parsing the ICS files. Loses cost,
  imageUrl, osmType/osmId, and geocodeSource precision.

The fallback was intentional for the transition period, but it is a silent
degradation path: if the outofband runner regresses or the file goes missing,
the build succeeds and events appear on the site — just without cost, images,
or OSM data — with no error surfaced anywhere.

## Risk of keeping the fallback

- A deploy that reverts `generate-outofband.ts` (or a runner misconfiguration)
  silently drops those fields for all ~1,000+ outofband events.
- The only signal is diffing events-index.json between builds — not something
  that alerts.

## Cleanup task (do once the runner is confirmed working)

### Trigger

Confirm that the outofband cron runner has been updated (i.e. it is now
running the `generate-outofband.ts` that emits `outofband-events.json`).
Evidence: a main-build log line like:
```
[outofband] Merged N of M events from outofband-events.json
```
appears in a successful CI run _after_ the PR merges.

### Changes

**`lib/calendar_ripper.ts`** — In the outofband events indexing block, remove
the `if (!outofbandEventsIndexed)` Option A fallback branch entirely. Replace
the silent `catch {}` on the `outofband-events.json` read with a logged warning
that counts toward the build summary (non-fatal, same pattern as a missing
outofband ICS file):

```typescript
if (outofbandReport) {
  try {
    const eventsJson = await readFile("outofband-events.json", "utf-8");
    const entries = JSON.parse(eventsJson) as OutofbandEventEntry[];
    let indexedCount = 0;
    for (const entry of entries) {
      if (!calendarsWithFutureEvents.has(entry.icsUrl)) continue;
      eventsIndex.push(entry);
      indexedCount++;
    }
    console.log(`[outofband] Merged ${indexedCount} of ${entries.length} events from outofband-events.json`);
  } catch (err: any) {
    // outofband-events.json missing or corrupt — outofband events will not
    // appear in the website/search. This is always a runner-side problem.
    console.warn(`[outofband] WARNING: outofband-events.json not found or unreadable — outofband events excluded from events-index.json: ${err?.message ?? err}`);
    // Surface as a non-fatal build error so it counts toward totalErrors and
    // appears in build-errors.json, the GitHub Actions step summary, the
    // Discord notification, and the website dashboard. A console.warn alone
    // is not enough — losing ~1,000 events is significant and must be audible
    // in every reporting channel.
    buildErrors.push({
      type: "OutofbandEventsFileMissing",
      reason: "outofband-events.json absent — outofband ripper events excluded from website/search",
    });
  }
}
```

Note: `buildErrors` above is the local array already used for config/parse
errors in `calendar_ripper.ts`. Adjust to match whatever the actual error
accumulation pattern is at that point in the file. **Why non-fatal and not
fatal:** making it fatal would break the entire build whenever S3 is
inaccessible or the runner hasn't run yet — which would be worse than degraded
event data. Non-fatal + `totalErrors` increment is the right balance: CI still
passes, but every reporting surface shows the gap.

**`docs/outofband.md`** — Remove the paragraph describing the Option A
fallback ("If `outofband-events.json` is absent …").

**`docs/plan-remove-outofband-ics-fallback.md`** — Delete this file.

### PR checklist

- [ ] Confirm CI log shows `Merged N of M events from outofband-events.json`
      (runner is already producing the file) before opening this PR
- [ ] Remove the `if (!outofbandEventsIndexed)` block (~30 lines)
- [ ] Replace `catch {}` with a logged + surfaced warning
- [ ] Verify the warning surfaces in `build-errors.json` format
- [ ] Delete this plan file
- [ ] Auto-merge eligible (bug fix / ripper maintenance)
