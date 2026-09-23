---
name: "Seatown Pottery"
status: notviable
platform: Webflow + 24hrpottery.com booking SaaS
url: https://www.seatownpottery.com/
tags: [Arts]
firstSeen: 2026-08-05
lastChecked: 2026-09-23
pr:
---

Ceramics studio collective with three Seattle locations (Green Lake,
Capitol Hill, Madison Park). Marketing site is Webflow; workshop
booking/dates are handled by a third-party SaaS, `24hrpottery.com`
(`app.24hrpottery.com/organizations/895d2405-1fbd-494e-8ac6-a06b930e2332/...`).

Not investigated further this cycle — need to check whether
`24hrpottery.com` exposes a public JSON API for workshop listings (it
looks like an org-scoped booking app, similar pattern to Mindbody/other
class-booking platforms used by yoga studios). If no public API exists,
this becomes `notviable` or a low-confidence custom scrape target.

**2026-09-23 (notviable):** Webflow `/workshops` lists course cards linking to `app.24hrpottery.com/courses/<uuid>`. That page is a Next.js app with Clerk auth: the SSR payload has course metadata but `firstCalendarEventStartTime: null`, and session dates load client-side from a private, undocumented booking API. There's no ICS, public JSON, or dated HTML. The content is also paid ceramics classes/workshops (booking inventory, not public events), and many cards are for sister studios in Bellevue/Redmond. Not viable.

**2026-09-23 (re-checked under King County rule):** Geography was never the blocker here, since the studios are in Seattle. Re-checked `/workshops`: course cards still link to `app.24hrpottery.com/courses/<uuid>`, with no dated sessions in the Webflow HTML and no public org API (the obvious `/api/organizations/<id>/courses` path returns 404). Still notviable: session dates are only in the private booking app.
