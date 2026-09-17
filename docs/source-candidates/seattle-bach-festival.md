---
name: Seattle Bach Festival
status: investigating
platform:
url:
tags: []
firstSeen: 2026-09-17
lastChecked: 2026-09-17
---

Requested via in-app feedback ([issue #1528](https://github.com/prestomation/206events/issues/1528)),
"Add the Seattle Bach festival" — no link was provided.

Ran a dozen+ varied searches (web search + Bing + DuckDuckGo, direct name,
"Bach Fest", nonprofit/GuideStar lookups, church/venue-based angles like
"Bach Vespers"/"Bach Cantata"/"Bach Camerata" Seattle, harpsichord/organ
series, "Northwest Bach Festival") and could not find any organization or
recurring event operating under the name "Seattle Bach Festival" — no
website, ticketing page, or social presence surfaced.

The closest existing match is **`sources/external/seattle-bach-choir.yaml`**
(already `status: added` — see `seattle-bach-choir.md`), a WordPress/Tribe
Events choir with a working ICS feed. Checked
`https://seattlebachchoir.org/` directly for any "festival" branding or
history — none found; they present as a standard seasonal concert choir,
not a festival.

Left as `investigating` rather than `notviable` since a small/low-web-presence
group could still exist under this name — needs a direct URL from the
requester to proceed. No implementation without a confirmed, fetchable
source (see AGENTS.md: never implement against a guessed URL).
