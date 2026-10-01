---
name: "Cyclists of Greater Seattle (COGS)"
status: notviable
platform: Wild Apricot
url: https://cyclistsofgreaterseattle.wildapricot.org/events
tags: [Cycling]
firstSeen: 2026-07-05
lastChecked: 2026-10-01
---

Cycling club running Wild Apricot with a public events calendar and RSS
feed (`/events/RSS`). First ride is free for non-members, so events are
genuinely public, not member-gated.

Investigated 2026-07-05: sampled the upcoming events (Jul 6 – Aug 21,
2026) and the overwhelming majority are outside Seattle city limits —
Kirkland Hills, North Lake Washington (Kirkland), Snoqualmie Falls, a
Portland-area gravel show, and Disaster Relief Trials (a Cascade
Bicycle Club event, not COGS's own). Only "Ride in Honor of Tom
Schaefer and Arnold Chin" is plausibly Seattle-based, unconfirmed. This
club serves the wider Eastside/Puget Sound region rather than
Seattle proper — fails the "Seattle-focused" quality gate even though
the platform (Wild Apricot RSS) would otherwise be straightforward to
parse. Not recommended.

**Re-evaluated 2026-10-01 (King County rule):** most of the out-of-Seattle
locations noted above (Kirkland, Snoqualmie Falls) are in King County, so
geography is no longer the disqualifier. Re-checked the live feed
(`/events/RSS`): still works, but only **1** truly upcoming event is in
it right now — "Annual Member Meeting" (Oct 16, 2026) at Ivar's Salmon
House on Lake Union, Seattle. The HTML events calendar page shows a few
more event links, but most are already-past dates within the current
month's calendar view, not reliably-upcoming items (no `upcoming`/`past`
split like the RSS feed has). No built-in ripper type ingests RSS
feeds (`lib/config/rss.ts` only *generates* this site's own RSS output),
so this would need a custom scraper for a single confirmed future event
— too thin to justify this cycle. Left `status: notviable`; re-check
once spring/summer ride season picks up and the feed carries more
upcoming items.
