# URL Entity Gate

## Problem

Some sources produced URLs containing HTML/XML character entities — most
commonly `&amp;`, but also `&#38;`, `&quot;`, `&#039;`, etc. These shipped
verbatim into the generated `.ics` files (`URL:`, `ATTACH:`, `IMAGE:` lines)
and the discovery JSON (`venues.json`, `events-index.json`, `manifest.json`),
producing broken links: a client following `https://x.com/e?id=1&amp;ref=cal`
sends `amp;ref=cal` as a bogus query parameter.

### Why nothing caught it

A literal `&` is **legal** in a URL (it separates query parameters), so the
two "validation" choke points both accept entity-laden URLs without complaint:

- `lib/config/schema.ts` `safeUrl()` → `new URL(raw).toString()`
- `lib/discovery.ts` `safeUrlString()` → `new URL(u).toString()`

`new URL("https://x.com/?a=1&amp;b=2").toString()` does **not** throw and does
**not** decode — it returns the string with `&amp;` intact.

### How they get in

1. **Rippers parsing HTML** (the main vector). Valid HTML encodes `&` inside an
   attribute as `&amp;` per spec, so a ripper that reads an `href` without
   decoding carries the entity straight into `event.url`.
2. **Hand-authored YAML** — a copy-pasted entity-encoded URL in a `url`,
   `friendlyLink`, `icsUrl`, `infoUrl`, or `imageUrl` field.

## Solution: fail the build

An HTML entity in a URL field is **always** a bug — there is no legitimate case
for one. So the build treats it as a **fatal error** rather than silently
normalizing it (which would hide the underlying ripper bug, against this repo's
"surface every gap, never quietly default" philosophy). Failing forces the fix
at the source and stops new rippers from sneaking entities in going forward.

### Detection — `lib/url-entities.ts`

`findHtmlEntities(value)` / `containsHtmlEntity(value)` match a known entity set
with a single regex:

```
/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi
```

This flags the common named entities plus any numeric character reference
(decimal `&#38;` or hex `&#x26;`), case-insensitively. A **bare `&`** is never
flagged — only `&` followed by a recognized entity token — so legitimate query
strings (`?a=1&b=2`) and ampersand-words (`?genre=r&band=foo`) pass cleanly.

### Enforcement — the gate in `lib/calendar_ripper.ts`

A single validation pass runs near the end of the build, after every ripper and
recurring calendar has produced its events and the external/ripper configs are
loaded. It scans every URL field and collects `UrlEntityError` records:

| Scope | Fields scanned | Source |
|-------|----------------|--------|
| `ripper` | `url`, `friendlyLink`, `imageUrl`, per-calendar `imageUrl` | hand-authored `ripper.yaml` |
| `external` | `icsUrl`, `infoUrl`, `imageUrl` | hand-authored `sources/external/*.yaml` |
| `event` | `event.url`, `event.imageUrl` | runtime extraction by a ripper |
| `recurring` | `event.url`, `event.imageUrl` | recurring event config |

Any violation:

- counts toward `totalErrors`,
- is added to `fatalErrorCount` → CI fails (`fatalErrorCount.txt > 0`),
- is recorded in `output/build-errors.json` under `urlEntityErrors`,
- emits a `::error::` line naming the scope, source, field, entity, and value.

Unlike parse errors (fatal only for *new* sources, tracked-but-non-fatal for
existing ones to keep the daily cron resilient against upstream drift), URL
entities are fatal for **new and existing** sources alike. An entity in a URL is
not "drift" — it's a broken link that was always wrong.

### Defense in depth — output choke points

`safeUrl()` and `safeUrlString()` also **omit** any URL that still contains an
entity (return `undefined`), so even if one somehow reaches the output stage it
is dropped rather than published as a broken link. `decodeUrlEntities()` is
available for callers that want to repair rather than drop, but the build's
primary stance is to fail, not normalize.

## Fixing a violation

- **`scope: "event"` (ripper-produced):** decode at extraction in the ripper.
  ```ts
  import { decode } from "html-entities";
  // ...
  url: decode(rawHref),
  ```
  ~13 rippers already use `html-entities` for titles/descriptions; apply it to
  URLs too. See `sources/nectar_lounge/ripper.ts` for the import pattern.
- **`scope: "ripper" | "external" | "recurring"` (hand-authored):** write the
  literal character in the YAML (`&`, not `&amp;`).

## Reporting parity

Per the Reporting Parity rule in `AGENTS.md`, `urlEntityErrors` is plumbed
through every surface that reads `build-errors.json`:

- PR comment (`.github/workflows/pr-preview.yml`)
- Main-build step summary + console summary (`lib/calendar_ripper.ts`)
- Website health dashboard (`web/src/components/HealthDashboard.jsx`)
- build-report skill (`skills/build-report/SKILL.md`)

Like other fatal categories (`newSourceParseErrors`, `newZeroEventSources`), it
is surfaced through the build *failure* rather than the Discord success embed.
