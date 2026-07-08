---
name: West Seattle Blog Event Calendar
status: candidate
platform: ICS (All-in-One Event Calendar plugin)
url: https://westseattleblog.com/events/
tags: ["West Seattle", "Community"]
firstSeen: 2026-07-08
lastChecked: 2026-07-08
pr:
---

West Seattle Blog's community event calendar — a long-running neighborhood
news site's aggregated listing of events across West Seattle (trivia nights,
markets, walking tours, festivals, watch parties, community meetings, etc.).
This is a republishing aggregator (many different venues/orgs), not a single
venue, so it should be added with `sourceRole: aggregator`.

🔥 High confidence — the site runs the **All-in-One Event Calendar** WordPress
plugin and exposes a standard ICS export URL, found via the page's "iCal" /
"webcal" export links on `/events/`:

```
https://westseattleblog.com/?plugin=all-in-one-event-calendar&controller=ai1ec_exporter_controller&action=export_events&no_html=true
```

Verified live 2026-07-08: HTTP 200, valid `BEGIN:VCALENDAR`/`VEVENT` content.
The feed contains 4713 total `VEVENT` entries, but the vast majority are past
(the export appears to include the site's full historical archive back to at
least May 2025). Filtering to `DTSTART >= today` (2026-07-08) leaves **55
confirmed upcoming events** spread from today through the end of 2026 —
comfortably above the "a few events" bar. Sample upcoming events: a
multi-day street festival (Festivals/Music), a Women's World Cup watch party
(Sports), and a Blue Angels Seafair item (Seafair).

Implementation notes for whoever picks this up:
- Add as `sources/external/west-seattle-blog.yaml` with the ICS URL above,
  `geo: null`, `sourceRole: aggregator`.
- Since the raw feed includes ~4600 past events, confirm the external-ICS
  loader already filters to future events (it should, like other ICS
  sources) before assuming this needs custom handling.
- Tag with `"West Seattle"` (registered neighborhood in `city.config.ts`).
  A generic `"Community"` tag may also fit; check `lib/config/tags.ts` for
  the closest existing spelling before introducing a new one.
- Likely produces some cross-source duplicates with venues already covered
  individually (e.g. Corner Pocket's Sunday trivia appears as its own event
  on this feed) — that's expected and handled by the existing cross-source
  dedup system, not a reason to skip this source.
