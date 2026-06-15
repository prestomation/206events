# Out-of-Band Calendar Sources

Some calendar sources are marked `proxy: "outofband"` because they return
`403 Forbidden` when fetched from GitHub Actions runner IPs but work fine
from a residential IP.

They are **skipped by the main CI build** (`generate-calendars`). Instead, a
cron job on the out-of-band runner runs `npm run generate-outofband`, uploads
the resulting `.ics` files and a rich report to S3, and the CI build downloads
them via `npm run download-outofband` before publishing.

## How it works

1. **The cron runner** runs `npm run generate-outofband` on a schedule from a residential IP
2. Script rips all outofband sources, writes `.ics` files to `output/`, produces `outofband-report.json` and `outofband-events.json`
3. Uploads all `.ics` files + `outofband-report.json` + `outofband-events.json` to `s3://calendar-ripper-outofband-220483515252/latest/`
4. **GitHub Actions** runs `npm run download-outofband` which pulls all files: `.ics` files go into `output/`, the two JSON files land at the repo root
5. The main `calendar_ripper.ts` reads `outofband-report.json` to register outofband calendars into the manifest and merge error counts. It then merges `outofband-events.json` directly into `events-index.json` so outofband events appear on the website and in search with full fidelity (cost, imageUrl, osmType/osmId, exact endDate). If `outofband-events.json` is absent (older runner), it falls back to re-parsing the ICS files.

## The Report (`outofband-report.json`)

`outofband-report.json` is the **single source of truth** for the outofband build. It is produced by `generate-outofband.ts` and consumed by `calendar_ripper.ts`. It contains everything the main build needs:

```jsonc
{
  "buildTime": "2026-03-15T01:37:00.000Z",
  "totalErrors": 7,
  "sources": [
    {
      "source": "sam",
      "friendlyName": "Seattle Art Museum",
      "description": "...",
      "friendlyLink": "https://www.seattleartmuseum.org/visit/calendar",
      "tags": ["Art", "Museums"],
      "calendars": [
        {
          "name": "sam-downtown",
          "friendlyName": "SAM Downtown",
          "icsFile": "sam-sam-downtown.ics",   // filename under latest/ in S3
          "events": 162,
          "hasFutureEvents": true,             // pre-computed; main build uses this directly
          "errors": [],
          "tags": ["Art", "Museums"]
        }
      ]
    }
  ]
}
```

### Why a report instead of re-parsing ICS?

- The outofband build already knows which calendars have future events — no need to re-parse ICS in CI
- Manifest metadata (friendlyName, description, tags, friendlyLink) lives in the outofband build, not duplicated in CI
- Error counts flow through the report into the overall build error count, replacing the old `outofband-error-count.txt` intermediary
- Outofband calendars with no future events are excluded from the manifest without any ICS reads

## The Events File (`outofband-events.json`)

`outofband-events.json` carries the full structured event data that the main build merges directly into `events-index.json`. Unlike re-parsing the ICS files, this preserves:

- **`cost`** — per-event pricing parsed by the ripper (ICS has no standard COST property)
- **`imageUrl`** — per-event images extracted by the ripper
- **`osmType` / `osmId`** — OpenStreetMap identity from the source-level `geo:` config
- **`geocodeSource`** — correct provenance tag (`'ripper'` vs `'cached'`)
- **Exact `endDate`** — computed directly from the ripper's `duration` before ICS encoding

The main build (`calendar_ripper.ts`) tries to load `outofband-events.json` first. If absent (runner predates this feature), it falls back to re-parsing the ICS files — same behavior as before this file existed.

## Manifest integration

`calendar_ripper.ts` reads `outofband-report.json` after the download step:
- Calendars with `hasFutureEvents: true` are added to `calendarsWithFutureEvents` and appear in `manifest.json` under `rippers`, with the same shape as regular rippers
- `totalErrors` from the report is merged into the overall build error count
- If the report is missing (S3 not configured, first run), the build continues without outofband calendars

## Infrastructure

- **S3 Bucket:** `calendar-ripper-outofband-220483515252` (us-west-2)
- **Var:** `OUTOFBAND_BUCKET` in GitHub repository variables (optional, defaults to bucket name above)
- **AWS credentials:** The cron runner uses default profile; CI uses `AWS_ROLE_ARN` secret via OIDC
- **CFN template:** `infra/authenticated-proxy/template.yaml`

## Current outofband sources

| Source | Status | Notes |
|---|---|---|
| `sam` | ✅ Working | 3 calendars (Downtown, Asian Art, Sculpture Park) |
| `5thavenue` | ❌ AXS 403 | Blocked even from residential — AXS anti-bot |
| `amc` | ❌ AMC 403 | Two locations (Pacific Place, Oak Tree) |
| `barboza` | ❌ AXS 403 | Same AXS issue |
| `clockout-lounge` | ❌ AXS 403 | Same AXS issue |
| `neumos` | ❌ AXS 403 | Same AXS issue |
| `rainier-arts-center` | ❌ WP 404 | WordPress REST API endpoint gone |
