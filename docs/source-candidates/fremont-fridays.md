---
name: "Fremont Fridays"
status: candidate
platform: Wix
url: https://www.fremontfridaysseattle.com/calendar
tags: [Music, Fremont, Community]
firstSeen: 2026-07-22
lastChecked: 2026-07-22
---

Independent weekly music and arts series in Fremont, organized as a
501(c)(3) nonprofit (affiliated with musicforeverybody.org). Runs 12 weeks
each summer, June 26 – September 11 in 2026, every Friday 5pm–late. Primary
venue is LTD Bar & Grill (309 N 36th St, Seattle, WA 98103), with additional
pop-up stages at Add-a-Ball, George & Dragon, The Fremont Social, Mermaid
Lounge, West of Lenin, The Cosmic Cottage, and other Fremont businesses.
Over 150 artists across the series; live music, comedy, film screenings,
and workshops. Most events free.

**Platform:** fremontfridaysseattle.com runs on Wix (thunderbolt renderer;
`wixstatic.com`/`parastorage.com` assets). The `/calendar` page is
client-side rendered — the weekly lineup content isn't present in the raw
HTML response, so it can't be scraped without a headless browser. No ICS
feed or public API found.

**Possible implementation path:** since the series runs on a fixed weekly
cadence for a known season (every Friday, June–September, 5pm start),
this could work as a `sources/recurring/fremont-fridays.yaml` entry
anchored to LTD Bar & Grill as the primary venue (similar pattern to
`georgetown-trailer-park-mall.yaml`), rather than scraping the JS-rendered
calendar for per-week lineups. Would need to confirm exact 2026 season
end date and typical event duration before implementing.
