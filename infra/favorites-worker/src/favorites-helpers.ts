import type { Env, FavoritesRecord, FavoriteList, UserListsRecord, UserRecord } from './types.js'
import { extractUserId } from './auth-middleware.js'

export async function requireAuth(c: any): Promise<string | null> {
  const userId = await extractUserId(c.req.header('Cookie'), c.env.JWT_SECRET)
  return userId || null
}

// The migrated/default list keeps a fixed id so its feed token (the user's
// original feedToken) and back-compat alias routes resolve deterministically.
export const DEFAULT_LIST_ID = 'default'
export const DEFAULT_LIST_NAME = 'My Favorites'

// NOTE: All list mutations do read-modify-write on a single KV key (the
// userId in FAVORITES). Concurrent mutations for the same user can race
// (last write wins). KV does not support CAS. This is acceptable given low
// per-user concurrency; Durable Objects would be needed for true atomicity.

function emptyList(id: string, name: string, feedToken: string, now: string): FavoriteList {
  return {
    id,
    name,
    feedToken,
    icsUrls: [],
    searchFilters: [],
    geoFilters: [],
    createdAt: now,
    updatedAt: now,
  }
}

// Normalize a list read from storage so optional/legacy fields are always
// present as arrays.
function normalizeList(list: FavoriteList): FavoriteList {
  if (!Array.isArray(list.icsUrls)) list.icsUrls = []
  if (!Array.isArray(list.searchFilters)) list.searchFilters = []
  if (!Array.isArray(list.geoFilters)) list.geoFilters = []
  return list
}

async function getUserFeedToken(env: Env, userId: string): Promise<string> {
  const raw = await env.USERS.get(userId)
  if (!raw) return ''
  try {
    return (JSON.parse(raw) as UserRecord).feedToken || ''
  } catch {
    return ''
  }
}

/**
 * Parse a raw FAVORITES KV value into the new UserListsRecord shape WITHOUT
 * persisting or touching other KV namespaces. Handles three cases:
 *  - new shape (`{ lists: [...] }`) → normalized as-is
 *  - old flat shape (`{ icsUrls, searchFilters, geoFilters }`) → wrapped into a
 *    single default list (feedToken left blank; callers that need it fill it in)
 *  - missing/unparseable → empty list set
 *
 * This is the read path used by feed.ts, where we must not write back.
 */
export function parseListsRecord(raw: string | null): UserListsRecord {
  const now = new Date().toISOString()
  if (!raw) return { lists: [], updatedAt: now }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.lists)) {
      const rec = parsed as UserListsRecord
      rec.lists = rec.lists.map(normalizeList)
      return rec
    }
    // Old flat shape — wrap into a single default list.
    const flat = parsed as FavoritesRecord
    const list = emptyList(DEFAULT_LIST_ID, DEFAULT_LIST_NAME, '', flat.updatedAt || now)
    list.icsUrls = Array.isArray(flat.icsUrls) ? flat.icsUrls : []
    list.searchFilters = Array.isArray(flat.searchFilters) ? flat.searchFilters : []
    list.geoFilters = Array.isArray(flat.geoFilters) ? flat.geoFilters : []
    list.createdAt = flat.updatedAt || now
    return { lists: [list], updatedAt: flat.updatedAt || now }
  } catch {
    return { lists: [], updatedAt: now }
  }
}

/** Resolve a single list from a record by id, falling back to the first
 * (default) list when listId is absent — matching how legacy feed tokens
 * (no listId) and back-compat alias routes behave. */
export function resolveList(rec: UserListsRecord, listId?: string): FavoriteList | null {
  if (listId) return rec.lists.find(l => l.id === listId) ?? null
  return rec.lists[0] ?? null
}

/**
 * Load a user's lists for the authenticated API, lazily migrating the old flat
 * shape (or a missing record) into a default list that reuses the user's
 * existing feedToken. Persists the migrated shape and ensures the default
 * list's FEED_TOKENS entry carries its listId so the original subscription URL
 * keeps resolving.
 */
export async function getLists(env: Env, userId: string): Promise<UserListsRecord> {
  const raw = await env.FAVORITES.get(userId)
  const now = new Date().toISOString()

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.lists)) {
        const rec = parsed as UserListsRecord
        rec.lists = rec.lists.map(normalizeList)
        return rec
      }
    } catch {
      // fall through to (re)build a default list below
    }
  }

  // Either no record yet, or an old flat record that needs migrating. Build a
  // default list seeded from any flat data, reusing the user's existing token.
  const flat = parseListsRecord(raw).lists[0]
  const feedToken = await getUserFeedToken(env, userId)
  const list = flat ?? emptyList(DEFAULT_LIST_ID, DEFAULT_LIST_NAME, feedToken, now)
  list.id = DEFAULT_LIST_ID
  list.name = DEFAULT_LIST_NAME
  list.feedToken = feedToken

  const rec: UserListsRecord = { lists: [list], updatedAt: now }
  await env.FAVORITES.put(userId, JSON.stringify(rec))
  if (feedToken) {
    await env.FEED_TOKENS.put(feedToken, JSON.stringify({ userId, listId: DEFAULT_LIST_ID }))
  }
  return rec
}

/** Persist a lists record, bumping its top-level updatedAt. */
export async function saveLists(env: Env, userId: string, rec: UserListsRecord): Promise<void> {
  rec.updatedAt = new Date().toISOString()
  await env.FAVORITES.put(userId, JSON.stringify(rec))
}

/**
 * Load the user's lists and resolve a single target list. Returns both the
 * full record (so callers can persist) and the resolved list, or null when a
 * specific listId was requested but not found.
 */
export async function getListContext(
  env: Env,
  userId: string,
  listId?: string,
): Promise<{ rec: UserListsRecord; list: FavoriteList } | null> {
  const rec = await getLists(env, userId)
  const list = resolveList(rec, listId)
  if (!list) return null
  return { rec, list }
}
