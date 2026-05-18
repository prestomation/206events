# Implicit Uncertainty Audit

Audit of every ripper for places where the parser invented a value (a
default time, a default duration, a fallback location) when the source
omitted it. These are exactly the "guess that looks like a fact"
situations the uncertainty system was built for — see
`docs/event-uncertainty.md` and the canonical `sources/events12/ripper.ts`
pattern.

This PR migrates each of these to emit a placeholder + an
`UncertaintyError` so the resolver can fill in the truth later.

## Verdict per ripper

### Already opted in
- `sources/events12/ripper.ts` — canonical implementation; serves as the
  template for everything below.

### Built-in rippers (Tier 1)
These ship in `lib/config/*.ts` and back many `ripper.yaml` configs, so
every patch here ripples across the calendar.

| Ripper | Implicit defaults | UncertaintyField(s) |
|---|---|---|
| `lib/config/ticketmaster.ts` | falls back to **19:30** when only `localDate` is present (`parseDate`); `Duration.ofHours(2)` for every event regardless of source | `startTime`, `duration` |
| `lib/config/dice.ts` | `defaultDurationHours` (3h) when `date_end` is absent | `duration` |
| `lib/config/eventbrite.ts` | `defaultDurationHours` (2h) when `event.end.local` is absent | `duration` |
| `lib/config/squarespace.ts` | `Duration.ofHours(2)` when `endDate` is missing | `duration` |
| `lib/config/axs.ts` | `Duration.ofHours(2)` (AXS API never returns an end time) | `duration` |

`defaultLocation` is **not** treated as uncertain: when the source
omits the venue, the events really are at the configured venue
(substation, elliott bay, etc.), so it's a reasonable inference, not a
guess.

### High-volume custom rippers (Tier 2)
| Ripper | Implicit defaults | UncertaintyField(s) |
|---|---|---|
| `sources/19hz/ripper.ts` | "Default: 8pm, 3 hours" catchall when the time cell format is unrecognized | `startTime`, `duration` |
| `sources/waterfront_park/ripper.ts` | five `Duration.ofHours(2)` fallbacks when time-range parsing fails | `duration` |
| `sources/pac_sci/ripper.ts` | midnight + 24h synthesis for date-only events, plus 2h default when end time is absent | `startTime`, `duration` |

### Tier 3 custom rippers
| Ripper | Implicit defaults | UncertaintyField(s) |
|---|---|---|
| `sources/discover_slu/ripper.ts` | "default to 10 AM" + 2h fallback | `startTime`, `duration` |
| `sources/rainier_arts_center/ripper.ts` | 19:00 + 2h fallback when time element unparseable | `startTime`, `duration` |
| `sources/national_nordic_museum/ripper.ts` | 10:00 + 2h fallback ("Unparseable time — default to 10am, 2 hours") | `startTime`, `duration` |
| `sources/frye_art_museum/ripper.ts` | 10:00 + 2h fallback (same comment) | `startTime`, `duration` |
| `sources/mopop/ripper.ts` | `Duration.ofHours(4)` when `endDate` missing | `duration` |
| `sources/hidden_hall/ripper.ts` | `Duration.ofHours(2)` when `endDate` missing | `duration` |
| `sources/seattle_center/ripper.ts` | 12h or 2h fallback for all-day vs. timed events when end is missing | `duration` |
| `sources/burke_museum/ripper.ts` | verify against source: any time-default code path | TBD |
| `sources/sam/ripper.ts` | verify against source: any time-default code path | TBD |

### Out of scope (Phase 4, deferred)
- Image fallbacks (logo-as-placeholder). The schema supports
  `image` as an `UncertaintyField` but no ripper exercises it yet.

## Approach for each opt-in

Mirror `sources/events12/ripper.ts`:

1. Detect each "we had to default this" branch in the parser.
2. Build the `RipperCalendarEvent` with the placeholder values.
3. Emit a paired `UncertaintyError` with the **same** `event.id`,
   `unknownFields` listing every field that was defaulted, and a
   `partialFingerprint` hashed over whatever the ripper *did* parse
   from the source so cache entries invalidate when upstream
   eventually fills the gap.
4. Combine multiple unknown fields for the same event into one
   `UncertaintyError` (per docs).
5. Ensure the event id is content-derived (no `Date.now`, no array
   index). Built-ins already use upstream ids; custom rippers may need
   a `slugify(title)-YYYY-MM-DD` style id.

## Reporting parity

All reporting surfaces are already wired up to count and surface
`type: "Uncertainty"` errors. No reporting changes required in this PR.
