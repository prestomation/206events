---
name: "Salsa Con Todo"
status: notviable
platform: Wix Events (client-rendered)
url: https://www.salsacontodo.com/seattle-dance-community-calendar
tags: [Dance]
firstSeen: 2026-07-29
lastChecked: 2026-07-29
---

Latin dance studio at 211 N 36th St, Fremont — Salsa/Bachata/Lindy
Hop/Brazilian Zouk/West Coast Swing/Kizomba classes and a community
dance calendar page.

Not viable: the calendar page is a Wix Events widget with no data in the
static HTML — the `#wix-warmup-data` script tag present in the page source
is empty of event content (`{"pages":{...},"appsWarmupData":{},"builderComponentsWarmupData":{}}`),
confirming events load via a client-side API call after page load rather
than being embedded server-side. No public REST endpoint found. Same
pattern as other Wix sites already logged as not viable in this repo
(e.g. `axekickers`, `silent-dance-alki`) — would need headless-browser
rendering, which this pipeline doesn't have.
