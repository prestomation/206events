---
name: Youth Class Level 2 - Standard (Friday)
status: notviable
platform: Momence (readonly-api.momence.com)
url: https://ariaballroom.com/calendar/
tags: ["dancing", "learning", "family"]
firstSeen: 2026-08-25
lastChecked: 2026-09-17
---

Discovered via aggregator gap analysis. 3 events in the Seattle
metro sample. Source domain: ariaballroom.com.

Sample event: "Youth Class Level 2 - Standard (Friday)" (2026-08-29T00:30:00.000Z)
Description: Group class focusing on Standard for silver/advanced youth students. All classes in youth program only purchasable as monthly tuition.

**Investigated 2026-09-17, not viable — outside Seattle.** The site embeds
a Momence booking widget (`momence.com/u/aria-ballroom-JL332r`, `hostId`
43120); watching the widget's network requests turns up a public,
unauthenticated JSON schedule API
(`readonly-api.momence.com/host-plugins/host/43120/host-schedule/sessions`)
with real data (35+ distinct weekly dance classes). But the venue's actual
address is **15300 NE 95th St, Redmond, WA 98052** — Redmond, not Seattle.
Per the source-discovery quality gate ("venues entirely outside Seattle
city limits are not appropriate"), not implemented. The same Momence API
pattern (find the widget's `hostId` via its network calls, hit
`readonly-api.momence.com/host-plugins/host/<id>/host-schedule/sessions`)
was reused successfully for a real West Seattle studio — see
`docs/source-candidates/dragonfly-west-seattle.md` — so it's worth
re-trying against any other Momence-widget site if one turns up in Seattle
proper.
