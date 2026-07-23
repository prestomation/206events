---
name: "Fremont Fridays"
status: candidate
platform: Wix
url: https://www.fremontfridaysseattle.com/calendar
tags: [Music, Fremont, Community]
firstSeen: 2026-07-22
lastChecked: 2026-07-23
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

Re-checked 2026-07-23: found a **conflicting cadence claim**. The site's
own homepage still says "every Friday" June 26 – Sept 11, and the
`/calendar` page shows a live "WEEK 5" card for July 24, 2026 — consistent
with weekly framing. But EverOut's listing (`everout.com/seattle/events/
fremont-fridays/e101453/`) describes it as "every Friday, every other
week, through August 20, 5–10pm" and a Converge Media write-up says the
evening "starts at the George & Dragon All-Ages Stage at 6pm, then flows
to LTD and between all 3 venues" — i.e. potentially biweekly (not weekly)
and a multi-venue crawl rather than one fixed LTD Bar & Grill location.
Given the direct conflict between "every Friday through Sept 11" and
"every other week through Aug 20," and the multi-venue-per-night detail,
do not guess at the recurring pattern — a wrong cadence or location would
silently publish incorrect times. Re-check nearer the end of the season
(or find an authoritative single source that resolves the weekly-vs-
biweekly discrepancy) before writing the recurring YAML.
