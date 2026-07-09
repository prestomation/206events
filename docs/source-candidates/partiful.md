---
name: Partiful (Seattle public events)
status: notviable
platform: Custom (Firebase/Firestore-backed app)
url: https://partiful.com/explore
tags: [Community]
firstSeen: 2026-07-08
lastChecked: 2026-07-08
---

Party/event-invite app with an Explore/Discover feed of public events. The
app shows a real **"Trending in Seattle"** section, so Seattle content
*does* exist in Partiful's backend. Rejected as `notviable` on **Terms of
Service grounds**, not technical ones — see below.

## Technical path (proven, for the record)

No Android APK teardown is needed. The web app is Next.js and hands its
data to us as clean JSON:

- **Individual public event pages** — `https://partiful.com/e/<id>` return
  HTTP 200 with a full `__NEXT_DATA__` JSON blob, no auth. The event object
  carries everything a ripper needs: `id`, `title`, `startDate`, `endDate`,
  `timezone`, `description`, `image`, `locationInfo` (structured address +
  Google/Apple Maps URLs + neighborhood), guest counts, `isPublic`,
  `status`.
- **Explore feeds** — `https://partiful.com/explore/<city>` are statically
  pre-rendered (Next.js `getStaticProps`) for exactly **9 hardcoded
  cities**: `nyc, la, sf, bos, dc, chi, lon, mia, atx`. Seattle is not one
  of them (`/explore/seattle` and `/explore/sea` → 404; the on-demand
  `/_next/data/<buildId>/explore/*.json` route 404s too, so `getStaticPaths`
  is `fallback: false`). The default web region is IP-geolocated (a
  California datacenter IP resolves to `SF`), and `regionEventCounts` only
  ever lists those same 9 regions.

The Seattle feed the app shows comes from a Firestore collection
**`discoverItems`** in Firebase project `getpartiful` (project number
`939741910890`), queried directly by the logged-in app and filtered to the
user's location. **Enumerating Seattle requires an authenticated user** —
there is no public/anonymous path to it:

- Direct Firestore REST read of `discoverItems` → `403 PERMISSION_DENIED`
  (security rules require auth).
- Firebase **anonymous** sign-in → disabled (`ADMIN_ONLY_OPERATION`).
- Guessed public discover cloud functions (`discover`, `getDiscoverItems`,
  `exploreFeed`, … 10 names) → all `404`.
- The web API key is HTTP-referrer-restricted (needs
  `Referer: https://partiful.com/`), but that only gates the key, not the
  auth requirement.

So the only way to build a Seattle ripper would be to authenticate as a
real user (store a personal Firebase refresh token in CI, mint idTokens,
query `discoverItems` for the Seattle region). That is the blocker, because
of the ToS.

## Why notviable — Terms of Service

Partiful's [Terms of Service](https://partiful.com/terms) expressly prohibit
this approach on multiple independent clauses (verified 2026-07-08):

- **No scraping / data mining** — *"engage in or use any data mining,
  robots, scraping, or similar data gathering or extraction methods."*
- **No unofficial access** — *"obtain or attempt to access or otherwise
  obtain any content or information through any means not intentionally made
  available or provided for through the Service."* (Minting idTokens outside
  the app and hitting Firestore REST directly is exactly this.)
- **No circumventing geographic restrictions** — *"circumvent … geographic
  restrictions applicable to the Service."* (Seattle is not a published web
  region.)
- **Personal use / no redistribution** — *"the Service is only for your
  personal use and you will not … reproduce, duplicate, copy … distribute …
  grant access to … any portion of the Service."* (Republishing the event
  data as a public 206.events ICS feed is redistribution, even though
  206.events is non-commercial.)
- **No reverse engineering** — would also cover sniffing the app's traffic
  to capture the exact query.

Using one's *own* credentials does not avoid this — the ToS binds the
account holder, and the personal-use + no-scraping clauses still apply.

This is materially different from the feeds this repo normally ingests
(public ICS/RSS/event APIs that venues publish *for syndication*). Partiful
expressly forbids scraping, non-official access, and redistribution all at
once, which also runs against this project's privacy/consent-by-design
posture.

## The legitimate paths (if Seattle coverage is wanted later)

- **Ask Partiful for an official feed/API** or permission. They already have
  a "submit your event to Explore" flow; an org-level feed would be the
  clean route.
- **Host-syndicated events** — if a Seattle host wants their event on
  206.events, cover it through a channel they publish themselves (their own
  ICS, or the existing `source-from-event` flow for a single host-submitted
  event) rather than harvesting Partiful's discover feed.

Revisit only if Partiful publishes a Seattle web region under permissive
terms, or offers an official API.
