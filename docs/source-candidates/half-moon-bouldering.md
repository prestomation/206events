---
name: "Half Moon Bouldering"
status: candidate
platform: Custom HTML (Webflow, static CMS content)
url: https://www.halfmoonbouldering.com/events
tags: [Sports, Greenwood]
firstSeen: 2026-08-15
lastChecked: 2026-08-15
---

Bouldering gym at 124 N 85th St, Seattle, WA 98103 (Greenwood), billed as
"Your social hub in the heart of Greenwood." The `/events` page ("Events and
Socials") is a Webflow site whose event content is present directly in the
static HTML (verified via `curl` — no JS rendering required), unlike sibling
climbing-gym candidates (`edgeworks-climbing.md`, `momentum-climbing-sodo.md`)
that are blocked or JS-rendered.

Investigated 2026-08-15 — confirmed a fixed weekly access-events schedule
plus a recurring annual one-off, all stated with concrete days/times in the
static markup:

- **BIPOC Night** — Mondays, 7:00 pm
- **Queer Climb Club** — Tuesdays, 7:00 pm (4th Tuesday of each month
  features "Queer Mountaineers")
- **Women's Wednesdays** — Wednesdays, 7:00 pm
- **Free Yoga** — Sundays (no time given on page, needs follow-up)
- **Annual Summer BBQ Night** — one-off dated event (e.g. "Thursday, August
  27, 6-8 pm" in 2026), not a fixed weekly recurrence — lower priority to
  automate, could be left out of a first pass

No ICS/API — registration for the access-events routes through a third-party
"Approach" booking portal (`halfmoonbouldering.portal.approach.app`), but the
schedule itself doesn't require hitting that portal since days/times are
static on the page.

🟡 Medium confidence — shaped like a `sources/recurring/<name>.yaml` multi-schedule
file (see AGENTS.md "Recurring Calendars" — one file, multiple `schedules:`
entries), similar to `sources/recurring/half-moon-bouldering`-style venues
already in the repo (e.g. gyms/breweries with weekly theme nights). Needs an
address geocode and confirmation of the Yoga start time before implementation.

Not currently covered in `sources/` or `sources/external/`.
