# Downtown Seattle Association Ripper

This module parses events from the Downtown Seattle Association's Tribe
Events REST API (`/wp-json/tribe/events/v1/events`) for its tracked venues:

- Occidental Square (venue_id: 53729)
- Pioneer Park (venue_id: 53757)
- Westlake Park (venue_id: 53732)
- Bell Street Park (venue_id: 53974)
- First & Pike (venue_id: 56426)
- McGraw Square (venue_id: 60595)

Plus a catch-all `other-events` calendar for events DSA lists that aren't
tied to one of the venues above — either because they have no venue at all
(e.g. "Belltown Blast", a neighborhood-wide street festival) or because
they use a one-off venue id (e.g. per-performer "Downtown Summer Sounds"
bookings). Adding a new physical venue calendar removes its events from
the catch-all automatically, since `other-events` excludes every
`venue_id` configured on the other calendars.

## Implementation

`rip()` fetches the full upcoming event list once (fully paginated, no
per-venue server-side filter), then `parseEvents()` buckets it into
calendars client-side by `venue_id` (or, for the catch-all calendar, by
exclusion of the known venue ids). Events tagged with DSA's "DSA
Member-Only" category (internal roundtables, member receptions) are
excluded from every calendar — they aren't events the public can attend.

Bucketing only looks at an event's *first* listed venue (`getVenue()`), so
an event the API tags with more than one venue is routed to just that
first venue's calendar — it won't also appear under its other venue(s),
and won't land in the catch-all either. This is a pre-existing limitation
of the venue-lookup logic, not something the catch-all rework fixes.

## Usage

```typescript
import DSARipper from './ripper.js';
import { ZonedDateTime, ZoneRegion } from '@js-joda/core';

const dsaRipper = new DSARipper();
const events = await dsaRipper.parseEvents(
    jsonData,
    ZonedDateTime.now(ZoneRegion.of("America/Los_Angeles")),
    { venue_id: 53729 } // For Occidental Square
);
```

## Event Structure

Each event contains:
- summary: Event title
- date: Start date and time with timezone
- duration: Event duration
- location: Venue name
- description: Event description (HTML tags removed)
- url: Link to event page
- ripped: Timestamp when the event was extracted
