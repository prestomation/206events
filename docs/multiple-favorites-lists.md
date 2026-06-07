# Multiple Favorites Lists

Signed-in users can maintain several themed favorites lists (e.g. "Date Night",
"Kids", "Work"), each producing its **own ICS subscription URL**, so different
lists can be subscribed into different calendars. Anonymous (localStorage) users
keep a single list and the UI is unchanged.

## Decisions

- **Multi-list is signed-in only.** Anonymous users get one synthetic list
  backed by the original `localStorage` keys.
- **Active-list selector** shows only when a user has more than one list. Follow
  / add actions target the active list.
- **The original feed URL is preserved.** The pre-existing `feedToken` becomes
  the token of the migrated default list ("My Favorites"), so existing calendar
  subscriptions keep resolving.
- **Cap of 10 lists per user**, enforced server-side (`MAX_LISTS` in
  `infra/favorites-worker/src/lists.ts`).

## Data model (worker)

The `FAVORITES` KV value (keyed by `userId`) changed from a flat
`FavoritesRecord` to a `UserListsRecord` container of lists
(`infra/favorites-worker/src/types.ts`):

```ts
interface FavoriteList {
  id: string            // stable slug; the migrated default list uses "default"
  name: string
  feedToken: string     // per-list token → per-list ICS URL
  icsUrls: string[]
  searchFilters: string[]
  geoFilters: GeoFilter[]
  createdAt: string
  updatedAt: string
}
interface UserListsRecord { lists: FavoriteList[]; updatedAt: string }

interface FeedTokenRecord { userId: string; listId?: string }  // listId added
```

### Lazy migration (on read)

`getLists(env, userId)` in `favorites-helpers.ts`:

- New shape (`{ lists }`) → returned normalized.
- Old flat shape (`{ icsUrls, … }`) → wrapped into a single default list
  (`id: "default"`, `name: "My Favorites"`) that **reuses the user's existing
  `feedToken`**, persisted back, and its `FEED_TOKENS` entry updated to carry
  `listId: "default"`. This keeps the old subscription URL working.
- Missing record → a default list is created the same way.

`parseListsRecord(raw)` is the **non-persisting** read path used by `feed.ts`
(it must not write back). `resolveList(rec, listId)` returns the list with that
id, or the first/default list when `listId` is absent — so legacy feed tokens
(minted without a `listId`) and old flat records keep resolving.

New-user signup (`auth.ts`) seeds the default list directly and writes its
`FEED_TOKENS` entry with `listId: "default"`.

## Worker API (`infra/favorites-worker/src/`)

| Method | Path | Body / Result |
|---|---|---|
| GET | `/lists` | `{ lists: [{ id, name, feedUrl, icsUrls, searchFilters, geoFilters, createdAt, updatedAt }], updatedAt }` |
| POST | `/lists` | `{ name }` → 201 with the created list; **400** once at `MAX_LISTS` |
| PATCH | `/lists/:listId` | `{ name }` → rename |
| DELETE | `/lists/:listId` | deletes the list + its feed token; **refuses to delete the last list** |
| GET/PUT/POST/DELETE | `/lists/:listId/favorites` | per-list favorites |
| GET/PUT/POST/DELETE | `/lists/:listId/search-filters` | per-list search filters |
| GET/POST/PUT/DELETE | `/lists/:listId/geo-filters` | per-list geo filters |

The flat `/favorites`, `/search-filters`, `/geo-filters` routes are kept as
**back-compat aliases** that operate on the user's default (first) list. The
item-route handlers are shared functions that take an optional `listId`
(undefined ⇒ default list), so the aliases and the `/lists/:listId/...` routes
call the same logic.

`feed.ts` resolves the list from the token's `listId` and otherwise runs the
exact same ICS-merge / Fuse / haversine / dedup assembly as before.

### Per-list feed tokens

Each list owns a `feedToken`; `POST /lists` mints a fresh one and writes a
`FEED_TOKENS[token] = { userId, listId }` reverse-lookup entry. `DELETE`
removes it. `GET /lists` builds each list's `feedUrl` as
`${origin}/feed/${feedToken}.ics`.

## Web UI (`web/src/`)

`App.jsx` holds `lists` + `activeListId`; `favorites` / `searchFilters` /
`geoFilters` are **derived from the active list**, so all the existing memoized
parity logic (`eventAttributions`, `favoritesEvents`, `followingGroups`, the
map, …) keeps operating on a single set of arrays unchanged.

- Anonymous: a single synthetic list (`id: "local"`) backed by the original
  `localStorage` keys; no selector renders.
- Signed-in: lists come from `GET /lists`. Mutations target
  `/lists/:activeListId/...`. On first login, anonymous localStorage data is
  migrated into the (empty) default list.

`YouView` (`redesign/views.jsx`) renders a list switcher (only when
`lists.length > 1`), the active list's feed-URL card, and create / rename /
delete controls. The "New list" control is disabled at the cap.

A global **"Saving to: &lt;list&gt;"** switcher (`SavingToSwitcher` in
`redesign/shell.jsx`, rendered in `TopBar`) appears on every view when signed-in
with more than one list, so it's always clear which list a Follow lands in and
the target can be changed from anywhere. It shares the `.a-dd*` dropdown styling
and calls the same `setActiveList`. The follow toast (`toggleFollow` in
`App206.jsx`) names the destination list when there's more than one
("Added 'Neumos' to Date Night").

## Local UAT / demo mode (`?uat=1`)

The signed-in multi-list UI needs an OAuth backend, which static preview deploys
(Cloudflare Pages) don't have — so the feature is otherwise unreachable for UAT.
Appending `?uat=1` to any deploy URL activates a **local demo mode**:

- A synthetic signed-in user ("UAT Tester") is set, so the multi-list UI renders.
- All lists live in `localStorage` (`calendar-ripper-uat-lists`); create / rename /
  delete and per-list favorites/search/geo all operate locally with **no network
  calls**. Per-list feed URLs are obviously-fake placeholders.
- An amber banner in the **You** view makes clear it's a browser-only demo.

The flag is read from the URL on load and is **not persisted** — reloading
without `?uat=1` returns to normal logged-out behavior. This ships in the bundle
but is inert unless the param is present, so production is unaffected. Implemented
in `web/src/App.jsx` (`readUatFlag`, `loadUatLists`, the `uatMode` branches in the
list handlers) and surfaced via `YouView`.

## Parity & tests

The **Favorites Filter Parity Rule** (AGENTS.md / CLAUDE.md) still holds — only
the *source* of the filter arrays is per-list.

- Worker: `test/lists.test.ts` (CRUD, `MAX_LISTS` cap, last-list delete guard,
  per-list token minting, old→new migration), `test/feed.test.ts` (token
  `listId` resolution + legacy fallback).
- Web: `src/filter-parity.test.js` (per-list resolution → identical
  client/server matched sets), `src/App.test.jsx` (switcher visibility,
  feed-URL swap, follow targets the active list).
- E2E: `e2e/lists.spec.js` with the logged-in fixture in `e2e/mock-routes.js`.
