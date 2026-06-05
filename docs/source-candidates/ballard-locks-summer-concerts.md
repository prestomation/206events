---
name: "Summer Concerts at the Ballard Locks"
status: added
firstSeen: 2026-06-05
lastChecked: 2026-06-05
tags: [Music, Ballard]
---
Free outdoor summer concert series in the Carl S. English Jr. Botanical Garden at Hiram M. Chittenden Locks (Ballard Locks), 3015 NW 54th St, Seattle, WA 98107. Organized by Friends of the Ballard Locks.

**Schedule (2026):** Every Saturday and Sunday from June 6 through September 7, 2:00–4:30 p.m. (29 concerts total).

**Platform:** Static schedule posted on `ballardlocks.org/free-summer-concerts.html` as an image file — not machine-readable.
Potential implementation: recurring YAML with two schedules (every Saturday + every Sunday, months: [6, 7, 8, 9]).

**Notes:**
- Verified via `myballard.com` article (June 2, 2026): concerts confirmed running
- ballardlocks.org schedule page returns an image (not parseable text)
- Recurring pattern is consistent year over year (every Sat/Sun through summer)
- Could be implemented as pure recurring YAML: `every Saturday` and `every Sunday`, `months: [6, 7, 8, 9]`, `start_time: "14:00"`, `duration: PT2H30M`
