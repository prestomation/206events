---
name: "Seattle Pop-Up Menu"
status: notviable
platform: Notion (embedded, no public API)
url: https://www.seattlepopupmenu.com/calendar
tags: ["Food", "PopUp"]
firstSeen: 2026-08-29
lastChecked: 2026-09-23
pr:
---

Seattle-focused directory/calendar of food & beverage pop-ups (chef
collabs, guest-night takeovers, one-off dinner series) across the city.
Surfaced via a "Seattle pop-up dinner series" search alongside EverOut's
pop-up category and the Let It Simmer newsletter — this one is a
dedicated, narrowly-scoped calendar rather than a general aggregator
category page.

Investigated 2026-08-29:
- `seattlepopupmenu.com/calendar` embeds an external Notion page
  (`heliotrope-cabin-23e.notion.site`) as the actual calendar — the
  marketing site itself has no event data.
- The Notion page is a client-side-rendered SPA; a plain fetch (WebFetch,
  no headless browser) returns only a loading shell ("Notion") with no
  visible database/table content. No ICS, RSS, or documented public API.
- Notion does not offer an official public read API for anonymous/public
  pages; unofficial reverse-engineered proxies (e.g. notion-api.splitbee.io)
  exist but are fragile, unsupported, and inappropriate to depend on for a
  production ripper.

**Verdict**: Not implementable today via any of our built-in ripper types
or a straightforward HTML/JSON scrape — the content lives behind a JS SPA
with no stable data endpoint. Leaving as `candidate` rather than
`notviable` in case Notion's rendered HTML changes, or the operator adds
an ICS/RSS export later; re-check in a future cycle rather than
re-searching for it fresh.

**2026-09-23 (notviable):** Re-checked. `/calendar` still just embeds a Notion page (`notion.site/16c345368f30836eb0cf0122e539dc7c`), and the Squarespace `?format=json` for the page is `typeName: page`, `itemCount: 0`. The only data path would be Notion's unofficial, unsupported internal API, which isn't appropriate for a production ripper. There's no ICS or RSS.
