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
    // outofband-events.json absent or corrupt — this is a FATAL build error
    // after the fallback is removed. Losing ~1,000+ outofband events silently
    // (search, Happening Soon, and the map all go dark) is worse than a
    // failed build that pages the operator to fix the runner.
    //
    // Use the same pattern as other fatal conditions: increment fatalErrorCount
    // and emit a GitHub Actions error annotation. The top-level build code
    // already logs ::error:: and exits non-zero when fatalErrorCount > 0.
    console.log(`::error::[outofband] outofband-events.json not found or unreadable — outofband ripper events excluded from events-index.json: ${err?.message ?? err}`);
    fatalErrorCount++;
  }
}
```

Note: `fatalErrorCount` is already a local variable in `calendar_ripper.ts`'s
`main()` scope; it controls the process exit code at the end of the build.
Do NOT push to `configErrors` or `buildErrors` here — those arrays have specific
shapes (`FileParseError`, `ImportError`) that don't fit this case, and a
TypeScript error would result.

**`docs/outofband.md`** — Remove the paragraph describing the Option A
fallback ("If `outofband-events.json` is absent …").

**`docs/plan-remove-outofband-ics-fallback.md`** — Delete this file.

### PR checklist

- [ ] Confirm CI log shows `Merged N of M events from outofband-events.json`
      (runner is already producing the file) before opening this PR
- [ ] Remove the `if (!outofbandEventsIndexed)` block (~30 lines)
- [ ] Replace the outer `catch` with `fatalErrorCount++` + `::error::` annotation
      (NOT `buildErrors.push` — that array has a different shape)
- [ ] Delete this plan file
- [ ] Auto-merge eligible (bug fix / ripper maintenance)

### Scope note: outofband external calendars are NOT affected

`outofband-events.json` only covers outofband **rippers** (the `outofbandConfigs`
loop in `generate-outofband.ts`). Outofband **external ICS calendars** are indexed
by a completely separate path in `calendar_ripper.ts` (the `activeExternalCalendars`
loop, lines ~1227–1279) that reads their pre-fetched ICS from disk. That path is
not touched by this cleanup and continues to work regardless.
