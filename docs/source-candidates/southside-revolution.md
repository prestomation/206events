---
name: "Southside Revolution"
status: investigating
platform: Wix
url: https://www.southsiderevolution.org/events-schedule
tags: [Sports]
firstSeen: 2026-08-16
lastChecked: 2026-08-16
---

South Seattle junior roller derby league (non-profit since 2014),
playing out of Southgate Roller Rink and other South Seattle venues.
Real, active, Seattle-focused org with a dated bout schedule.

Site is a **Wix** SPA (not Squarespace — confirmed via
`wix-essential-viewer-model` script tag and a signed Wix Events widget
instance token), which isn't one of this project's built-in ripper
types and is JS-rendered, so a plain HTML/JSON fetch returns only the
Wix app shell. The page does embed a `wix-events-web` widget, which
implies event data exists behind Wix's Events API, but that API
requires the site's signed per-request instance token (not a stable,
scrapable public endpoint) — would need either browser automation or
reverse-engineering the Wix Events REST API. Leaving as `investigating`
rather than `notviable`/`blocked` since the org and schedule are real;
worth a second look for a public iCal/RSS export Wix sometimes exposes
per-calendar before writing off.
