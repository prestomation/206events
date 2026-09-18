---
name: Seattle Bach Festival
status: investigating
platform:
url:
tags: []
firstSeen: 2026-09-17
lastChecked: 2026-09-18
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

**Lead found 2026-09-18** (while investigating
`docs/source-candidates/publicdisplay-art.md` /
`docs/source-candidates/art-love-salon.md`): the citywide aggregator
`publicdisplay.art/calendar` lists a real "Seattle Bach Festival" org
hosting a "Cantata Trail Lectures (2026-2027 Season)" event at Art Love
Salon, 110 Union St, on 2026-10-17. This org wasn't independently
verified to have its own site/feed this pass — only that it's real and
was findable through a different org's listing, which a direct name
search kept missing. Worth checking `publicdisplay.art` for this org's
own contact/link info, or re-running a search once the Cantata Trail
Lectures date is closer and more likely to be independently indexed.
