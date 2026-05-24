---
name: "EverOut Seattle (The Stranger)"
status: blocked
firstSeen: 2026-05-08
lastChecked: 2026-05-07
tags: [Community, Music, Arts]
---
`https://everout.com/seattle/events/`. Block source is **AWS ELB / WAF**
(`server: awselb/2.0`, HTTP 403), not Cloudflare — i.e. the request is
rejected at the load balancer before reaching the app.

The `/seattle/events.ics` URL pattern is plausible (returns a 301 →
trailing slash, then 403 from awselb on the slashed form), but
unconfirmed: the 301 is generic Django/nginx slash-normalization and
may happen even for non-existent endpoints (`/seattle/events.rss` 301s
the same way and the slashed form is a 404). `/seattle/feed/` is a
clean 404.

No sanctioned feed found in their docs or via search. Would need to
email `hello@everout.com` for a partner ICS, or test the outofband AWS
Lambda proxy (but our proxy also runs in AWS so it may share
IP-reputation blocks).

High value if unblocked (covers ~hundreds of Seattle events). Updated
2026-05-07.

**Per-location request: #397 (Magnuson Park Hangar 30)** — confirmed the
same block (`HTTP 403, server: awselb/2.0`) for the Hangar 30 location
page (`/seattle/locations/magnuson-park-hangar-30/l38287/`). Same
mechanism, no separate fix possible. The issue author already noted
this is a dup of the existing Everout candidate and suggested per-organizer
sources (NW Mineralogical Society shows, beer/cider festivals, vintage
markets) as a fallback path — those would need to be filed individually.
Re-checked 2026-05-24.
