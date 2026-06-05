# Surfacing more event & source data in the web UI

A gap analysis of the event/source data model against what the redesigned web
UI (`web/src/redesign/`) actually rendered turned up several fields that were
fetched (or trivially derivable from fetched data) but never shown to users.
This change fills four of them. No new data is produced by the build — every
field below already existed in `manifest.json` / `events-index.json`.

## What was added

### 1. Event end time / time range
`events-index.json` carries an `endDate` for every event, and ICS-parsed
channel events carry a JS `endDate`, but the UI only ever displayed the start
time. Events therefore looked open-ended.

`rowFromIndexEvent` now returns a `timeRange` alongside the existing start-only
`time`, built by a new `formatTimeRange(start, end, timezone)` helper in
`viewModels.js`. The range:
- collapses a shared meridiem (`7 – 9 PM` rather than `7 PM – 9 PM`),
- prefixes the end with its weekday when the range crosses midnight
  (`11 PM → Tue 1 AM`),
- falls back to the start alone when there's no usable end.

`timeRange` is shown in `EventRow` (cards), the `EventDetail` hero, and
`ParsedEventRow` (channel detail). The compact "More from …" rows keep the
start-only `time`.

### 2. Source website link
Rippers carry `friendlyLink` and external calendars carry `infoUrl` (mapped to
`friendlyLink` in `App.jsx`'s manifest normalization), but the channel
view-model dropped it, so `ChannelDetail` had no link to the source's own site.
`channelFromCalendar` now exposes `website`, and `ChannelDetail` renders a
"Visit website" link when present. Recurring entries have no website and show
nothing.

### 3. Source description
The ripper/external `description` was likewise dropped from the channel
view-model. `channelFromCalendar` now exposes `description`, and `ChannelDetail`
renders it — but suppresses it when it merely repeats the channel name
(per AGENTS.md a ripper's `description` is just the venue name, so showing it
under the identical title is noise). External-calendar descriptions, which are
authored as descriptive sentences, now show.

### 4. Channel tag chips
`ChannelDetail` previously showed only the single primary-category dot. It now
renders the full `tags` list (neighborhood + activity) as chips; each chip
routes to the Discover view with the matching neighborhood/category filter
applied.

### 5. Clickable links in event descriptions
Bare URLs in plain-text descriptions previously rendered as inert text.
`linkifyText` (in `EventDescription.jsx`) now turns them into real anchors
(new tab, `rel="noopener noreferrer"`). To keep descriptions uncluttered, a bare
URL renders as a compact **external-link icon badge** rather than the full URL
text — the destination host lives in the `title`/`aria-label` (e.g.
"Open example.com") so it stays discoverable on hover and to screen readers.
Anchors inside *HTML* descriptions keep their own link text and are forced
through a DOMPurify `afterSanitizeAttributes` hook so they always open in a new
tab safely.

## Where the logic lives
- `web/src/redesign/viewModels.js` — `formatTimeRange`, `timeRange` on
  `rowFromIndexEvent`, `website`/`description` on `channelFromCalendar`.
- `web/src/redesign/views.jsx` — `ChannelDetail` (description, tag chips,
  website link), `EventDetail` hero, `ParsedEventRow`.
- `web/src/redesign/atoms.jsx` — `EventRow`.
- `web/src/redesign/icons.jsx` — `globe` icon for the website link.

Unit coverage for the new view-model behavior is in
`web/src/redesign/viewModels.test.js`.
