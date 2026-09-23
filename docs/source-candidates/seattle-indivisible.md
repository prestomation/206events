---
name: Seattle Indivisible
status: added
platform: Mobilize (public API)
url: https://www.mobilize.us/seattleindivisible/
tags: [Political]
firstSeen: 2026-08-14
lastChecked: 2026-09-23
pr: 1571
---

Seattle Indivisible progressive political action events and meetings.

**Vetting notes (2026-08-14):** Blocked — two separate WebFetch attempts both
returned HTTP 403 Forbidden (likely bot/anti-scraping protection, e.g.
Cloudflare). Could not confirm platform, event listing, or feed availability.
Needs a re-check via a different fetch method before classifying further.

**Added 2026-09-23:** `seattleindivisible.com` is behind Cloudflare plus a SiteGround sgcaptcha challenge, but the org publishes its events on Mobilize (organization id 904), and the public API at `https://api.mobilize.us/v1/organizations/904/events` works. Added **`sources/seattle_indivisible/`** (`seattle-indivisible`), a custom JSON ripper modeled on `seward_park_audubon`. The org endpoint also returns about 200 events *promoted* from other orgs nationwide (Swing Left etc.), so the ripper keeps only events whose sponsor is Seattle Indivisible, that are in person, and that are located in Seattle. Virtual Zoom meetings and Lynnwood/Renton/Tacoma/Everett events are dropped. That gave 88 events, with 0 parse errors.
