# 206.events Feature Ideas

Non-source feature ideas and improvements for 206.events. Source candidates live in `docs/source-candidates.md`.

## Cross-Source Event Deduplication

The same event scraped from multiple sources (e.g., a concert listed on both a venue's site and Ticketmaster) currently appears multiple times in aggregate tag feeds. Implement fuzzy matching on title + date + venue to deduplicate:
- Normalize event titles (strip "LIVE:", "presents:", casing differences)
- Match events within a time window (e.g., same day, within 1 hour)
- Match venues by alias (e.g., "Climate Pledge Arena" vs "Climate Pledge")
- Keep the version with the most complete metadata (description, location, URL)
- Apply deduplication at the tag aggregation stage so individual source feeds remain unchanged

## Additional Farmers Markets

Add to `sources/recurring.yaml` using the `"every <day>"` schedule format. Verify schedules at the URLs before adding — hours and seasons can change year to year.

## Additional Recurring Events

### Seattle Street Food Festival
Two days in late August (annual) — South Lake Union — `https://206nightmarkets.com`

### Sakura-Con
Three-four days in early April (annual) — 2026: April 2-5 — Seattle Convention Center — Tags: Community, Arts

## New Tags Needed

Several venues would benefit from new tags in `lib/config/tags.ts`:
- **`Outdoors`** — for outdoor recreation organizations

## Dynamic Calendar Generation for Multi-Venue Sources

Sources like DSA (Downtown Seattle Association) manage 17+ venues on a single Tribe Events API, but calendars are currently hardcoded per venue ID in `ripper.yaml`. When a new venue gets events, someone must manually add it.

Refactor multi-venue rippers to support a `dynamic: true` mode that:
1. Fetches all events from the API (no venue filter)
2. Groups events by venue automatically
3. Creates per-venue calendars for any venue with ≥1 event
4. Skips venues with 0 events (no calendar generated)
5. Looks up geo/OSM IDs from the API's `geo_lat`/`geo_lng` when available, or falls back to `KNOWN_VENUE_COORDS`
6. Auto-generates calendar names and friendly names from venue data

This eliminates manual venue tracking and makes the calendar self-maintaining. Applies to any Tribe Events source with multiple venues.

## Staging Worker for PR Previews

PR previews currently share the production Cloudflare Worker (favorites API). Deploy a separate staging worker environment with isolated KV namespaces so preview users can't modify production data. See `docs/idea-staging-worker.md` for full design.

## Per-Event Category Tags

Tags currently live at the *source* level, so a venue tagged `Music` makes every event "Music" — including its trivia night. Add an LLM-powered build step (following the existing cache-overlay pattern used for photos/costs) that classifies individual events into categories (`Comedy`, `Kids`, `Trivia`, `AllAges`), stored in a committed cache keyed `source:eventId` and drained by a resolver skill. Would make filtering dramatically more precise and fits the established "gap queue + resolver skill" architecture.

## Age Restriction & Accessibility Fields

`docs/event-uncertainty.md` already lists these as natural future uncertainty fields. A `21+` / all-ages flag and wheelchair-accessibility info would enable a "family-friendly" filter — a common ask for event sites — and slots directly into the existing `UncertaintyField` extension checklist.

## Venue Pages

`venues.json` already has everything needed: per-venue permalink pages showing upcoming events, map pin, photo, and neighborhood. Good for SEO and for the "what's happening at Neumos this month" question the tag-centric UI doesn't answer directly.

## Event Change/Cancellation Surfacing for Favorites

Since builds regenerate everything, a diff step against the previous build (see `docs/event-history.json` machinery) could flag "an event you favorited moved from 7pm to 8pm" or "was removed from the source" in the Following tab. Time changes and cancellations are exactly where a calendar aggregator earns trust.

## Transit-Aware Geo Presets

The geo filter already does radius-from-point. Ship preset filters for light rail stations ("within a 10-minute walk of Capitol Hill Station") — pure static data, no new infra, and very Seattle-appropriate.

## Weather Badges for Outdoor Events

Fetch the forecast *at build time* (server-side, so no visitor data goes to a third party — stays inside the privacy rules) and badge outdoor-tagged events in the next 7 days. Pairs well with the `Outdoors` tag queued above.

## Personal Calendar Overlay (Client-Side Only)

Let a user paste/import their own ICS in the browser to gray out events that conflict with their existing schedule. Kept entirely client-side in `localStorage`, it stays within the consent-by-design constraints.

## schema.org/Event JSON-LD on Event Permalinks

Deep linking already exists; adding structured data would get events into Google's event search surface — probably the highest-leverage discoverability win available, and it's build-time-only.

## Embeddable Widget

A small self-hosted web component or iframe (`206.events/embed?tag=Ballard`) that neighborhood blogs and venue sites could drop in. Extends reach and creates a feedback loop with the sources being scraped. Must stay privacy-clean (no cookies, cookieless analytics only), which the current posture already supports.

## Community Event Submission

A "suggest an event / source" form that files a GitHub issue, which the existing `source-from-event` skill could triage automatically. The agent pipeline already exists; this gives the public a front door to it.

## Per-List RSS Feeds

The favorites worker already assembles per-list ICS; emitting an RSS variant of the same filtered stream would give users a notification channel (via any RSS reader) with zero new privacy surface — no email service needed.

## Sold-Out / Availability Tracking

`docs/sold-out-pricing.md` has a stub — surfacing "likely sold out" from ticketing APIs (DICE, Ticketmaster, AXS already have built-in rippers) would save users dead-end clicks.