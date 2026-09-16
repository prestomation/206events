---
name: "Silent Book Club - Seattle"
status: notviable
platform: Meetup
url: https://www.meetup.com/silent-book-club-seattle/
tags: []
firstSeen: 2026-09-16
lastChecked: 2026-09-16
---

Monthly drop-in silent-reading meetup found via a "Seattle silent book
club" search; it rotates across a different West Seattle bar/brewery/
coffee-shop each month rather than a single fixed venue. Hosted entirely
on Meetup — `/silent-book-club-seattle/events/` is a Next.js
client-rendered app; the plain-fetched HTML has only generic Meetup
`og:`/`ld+json` boilerplate (`"name":"Meetup"`), no per-event JSON-LD or
server-rendered date/venue data. Meetup has no public unauthenticated
events API this repo can call, and there's no built-in Meetup ripper
type. Related West Seattle chapters advertise via EverOut/individual
venue pages rather than their own feed.

**Verdict**: Not viable — Meetup-hosted, no server-rendered event data or
public API, and no fixed single venue to fall back on.
