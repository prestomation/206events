---
name: "Gator Boy Productions"
status: added
platform: Custom HTML (Divi WordPress, prose-based)
url: https://gatorboyproductions.com/events/
tags: [Dance, Music]
firstSeen: 2026-09-16
lastChecked: 2026-09-16
pr: 1520
---
**Gator Boy Productions** — `sources/gator_boy_productions` — Seattle-based Cajun/Zydeco dance promoter run by Sean "Gator Boy" Donovan. No ICS feed, JSON API, or schema.org JSON-LD; the events page is a WordPress/Divi page builder layout where every event is a `div.et_pb_text_inner` block with an `<h5>` eyebrow (optional), an `<h4 class="sqsrte-small">DATE | TITLE</h4>` heading, and a `<p>` description that names the venue + address in free-text "at VENUE (ADDRESS)" form — no start time in a structured field, only mentioned in prose (e.g. "6:30pm Dance Lesson, 7:30-10pm dance"). Required a custom `HTMLRipper`-style `IRipper` implementation (`node-html-parser`).

Events rotate between two recurring Seattle venues — **Reverie Ballroom** (Oddfellows Hall, 2nd Floor, 915 E Pine St, Capitol Hill) and **Eagles Mother Aerie** (8201 Lake City Way NE, Seattle) — plus occasional out-of-town dates (Portland OR memorial, Mercer Island VFW Hall "Louisianathon"). `geo: null` at the ripper level since there's no single fixed address; both recurring venues' coordinates were already present in the local `geo-cache.json` (Nominatim-resolved) and were also added to `KNOWN_VENUE_COORDS` in `lib/geocoder.ts` as a fallback so the source resolves with zero Nominatim calls even on a cold cache.

Judgment calls:
- **Seattle-only scope**: filtered to events whose extracted address contains "Seattle" OR names one of the two known-Seattle recurring venues (Reverie Ballroom / Eagles Mother Aerie don't always spell out "Seattle" in the address text — e.g. Reverie's is "...915 E Pine St, Capitol Hill"). Portland and Mercer Island events are dropped silently in the caller (not a parse failure, by design).
- **Recurring class-series date ranges** ("Thursdays, Sep.17–Oct.1") and **bare month-day ranges with no address** ("December 3-6" Seabeck Dance Camp, off-site with no venue info) are silently skipped, not surfaced as `ParseError`s — the repo's new-source CI gate treats any `ParseError` on a brand-new source as fatal, and both shapes are permanent, known-recurring fixtures of this page rather than a parser bug. A `single`-dated event missing its venue (which has never happened on the live page) still surfaces loudly as a `ParseError`, since that would indicate a real problem.
- **Cancellation notices** ("NO Gator Boy dance") are filtered in the caller before the parser runs, matched case-sensitively on the source's own ALL-CAPS "NO" convention to avoid false positives on normally-cased titles.
- **Start time / duration** are inferred heuristically from the description prose (first and last clock-time tokens found) and flagged via `UncertaintyError` when no confident range is found, per the repo's event-uncertainty system — the source has no structured time field.
- **Venue/address extraction** requires a digit in the captured parenthetical (a real street address always has a house number), so an unrelated aside between "at" and the real venue name can't be silently captured as a bogus address.

9 upcoming events at time of implementation (7 Eagles Mother Aerie "Juke Joint" Friday dances, 1 Reverie Ballroom Sunday dance, 1 Eagles Mother Aerie holiday event); 0 `ParseError`s against the live page.
