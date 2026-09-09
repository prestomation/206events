---
name: "Glitter and Gold Studio"
status: added
platform: Eventbrite
url: https://www.eventbrite.com/e/monthly-open-sapphire-mining-night-at-glitter-gold-studio-tickets-1995498852786
tags: [Community, SoDo]
firstSeen: 2026-08-07
lastChecked: 2026-09-09
pr: 1423
---

Discovered via r/SeattleEvents post: https://old.reddit.com/r/SeattleEvents/comments/1vhb21g/montana_sapphire_mining_social_event_at_glitter/
Post title: "Montana sapphire mining social event at Glitter and Gold Studio in SODO! (August 13th, 6-8PM)"
Post date: 2026-08-06

Glitter and Gold Studio is a small independent jewelry studio in SODO Seattle,
owned by Mary Elizabeth Linford. They host a monthly "Open Sapphire Mining
Night" on the third Thursday of each month (6-8 PM), where guests mine genuine
Montana sapphires. Profits are donated to The Lavender Rights Project.

The event is recurring (monthly) and listed on Eventbrite. Multiple event
listing IDs have been observed (e.g. 1987075002824 for April 2026, 1995498852786
for August 2026), suggesting each month gets its own Eventbrite listing rather
than a single recurring event page.

Website: https://glitterandgoldstudio.com/ (jewelry studio site, no event
calendar — all events are on Eventbrite)

Organizer: Mary Elizabeth Linford (Eventbrite organizer ID not publicly
accessible via profile page — returns 404). May need to search Eventbrite
for "glitter gold studio" to find new monthly listings.

Investigated 2026-08-11 as a `sources/recurring/` candidate (fixed venue,
monthly cadence, no organizer feed needed): confirmed address via web
search — 3201 1st Avenue South, Suite 112, Seattle, WA 98134 (the Trigger
Building, SODO; OSM node 2350316323, 47.5752912/-122.3347486). **Rejected
as a recurring-YAML source**: the studio's own listing text says the
mining night is "the third Thursday of every month (more or less)", and
the live August 2026 Eventbrite listing confirms it — Aug 13, 2026, which
is the **2nd** Thursday of August, not the 3rd. A fixed `schedule: "3rd
Thursday"` RRULE would have been wrong (generated Aug 20 instead of the
real Aug 13 date). Without a stable ordinal-weekday pattern, this doesn't
fit the recurring-YAML model — would need a real feed (organizer page,
ICS) to track the actual monthly date, and none is available. Leaving as
`candidate`; re-check periodically for an Eventbrite organizer page.

**Implemented 2026-09-09:** found the real organizer ID by fetching the
September 2026 event listing page directly and reading the embedded
`organizer_id` field (`57832351373`, "Mary Elizabeth Linford") — the
organizer's own profile page 404s, but the ID is embedded on any of her
event pages regardless. The public unauthenticated Eventbrite mirror
confirms it's live: `GET /api/v3/organizers/57832351373/events/?status=live`
returns 1 upcoming event, "Monthly Open Sapphire Mining Night at Glitter &
Gold Studio", Sep 17, 2026 6-8pm PT. Since the built-in `eventbrite` ripper
type pulls whatever the organizer has posted (no fixed-schedule assumption
needed, unlike the rejected recurring-YAML approach), the earlier "2nd
Thursday not 3rd" objection doesn't apply here — implemented as
`sources/glitter_and_gold_studio` (`type: eventbrite`, `organizerId:
"57832351373"`, `expectEmpty: true` since the next month's listing isn't
always posted yet). `EVENTBRITE_TOKEN` is only available in CI, so 0
events + a "not set" `ParseError` locally is expected; CI already has the
secret provisioned for other Eventbrite sources (e.g. `actualize-air`).