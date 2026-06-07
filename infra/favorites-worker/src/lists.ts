import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Env, FavoriteList } from './types.js'
import { requireAuth, getLists, saveLists, DEFAULT_LIST_ID } from './favorites-helpers.js'
import {
  handleGetFavorites, handlePutFavorites, handleAddFavorite, handleDeleteFavorite,
} from './favorites.js'
import {
  handleGetSearchFilters, handlePutSearchFilters, handleAddSearchFilter, handleDeleteSearchFilter,
} from './search-filters.js'
import {
  handleGetGeoFilters, handleAddGeoFilter, handlePutGeoFilters, handleDeleteGeoFilter,
} from './geo-filters.js'

// Per-user cap on the number of favorites lists. Enforced server-side in
// POST /lists; the web UI also disables list creation at this cap, but the
// worker is the source of truth. Mirrors MAX_FAVORITES / MAX_SEARCH_FILTERS /
// MAX_GEO_FILTERS in the item route files.
export const MAX_LISTS = 10

const MAX_NAME_LENGTH = 80

function sanitizeName(name: string): string {
  return name
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // strip control chars
    .trim()
    .slice(0, MAX_NAME_LENGTH)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Generate a list id that is stable, slug-derived, and unique within the
 * user's existing lists. */
function generateListId(name: string, existing: FavoriteList[]): string {
  const base = slugify(name) || 'list'
  const taken = new Set(existing.map(l => l.id))
  if (base !== DEFAULT_LIST_ID && !taken.has(base)) return base
  // Append a short random suffix until unique.
  for (let i = 0; i < 100; i++) {
    const candidate = `${base}-${crypto.randomUUID().slice(0, 6)}`
    if (!taken.has(candidate)) return candidate
  }
  // Extremely unlikely fallback.
  return `${base}-${crypto.randomUUID().replace(/-/g, '')}`
}

function mintFeedToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
}

function feedUrlFor(c: Context<{ Bindings: Env }>, feedToken: string): string {
  const origin = new URL(c.req.url).origin
  return `${origin}/feed/${feedToken}.ics`
}

function serializeList(c: Context<{ Bindings: Env }>, list: FavoriteList) {
  return {
    id: list.id,
    name: list.name,
    feedUrl: feedUrlFor(c, list.feedToken),
    icsUrls: list.icsUrls,
    searchFilters: list.searchFilters,
    geoFilters: list.geoFilters,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  }
}

export const listsRoutes = new Hono<{ Bindings: Env }>()

// GET /lists — all of the user's lists, each with its own feed URL.
listsRoutes.get('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const rec = await getLists(c.env, userId)
  return c.json({
    lists: rec.lists.map(l => serializeList(c, l)),
    updatedAt: rec.updatedAt,
  })
})

// POST /lists — create a new list (mints its own feed token).
listsRoutes.post('/', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { name?: unknown }
  try {
    body = await c.req.json() as { name?: unknown }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof body.name !== 'string') {
    return c.json({ error: 'name must be a string' }, 400)
  }
  const name = sanitizeName(body.name)
  if (name.length === 0) {
    return c.json({ error: 'name must be a non-empty string' }, 400)
  }

  const rec = await getLists(c.env, userId)
  if (rec.lists.length >= MAX_LISTS) {
    return c.json({ error: `Maximum number of lists reached (max ${MAX_LISTS})` }, 400)
  }

  const now = new Date().toISOString()
  const feedToken = mintFeedToken()
  const list: FavoriteList = {
    id: generateListId(name, rec.lists),
    name,
    feedToken,
    icsUrls: [],
    searchFilters: [],
    geoFilters: [],
    createdAt: now,
    updatedAt: now,
  }
  rec.lists.push(list)
  await saveLists(c.env, userId, rec)
  await c.env.FEED_TOKENS.put(feedToken, JSON.stringify({ userId, listId: list.id }))

  return c.json({ list: serializeList(c, list) }, 201)
})

// PATCH /lists/:listId — rename a list.
listsRoutes.patch('/:listId', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { name?: unknown }
  try {
    body = await c.req.json() as { name?: unknown }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof body.name !== 'string') {
    return c.json({ error: 'name must be a string' }, 400)
  }
  const name = sanitizeName(body.name)
  if (name.length === 0) {
    return c.json({ error: 'name must be a non-empty string' }, 400)
  }

  const listId = c.req.param('listId')
  const rec = await getLists(c.env, userId)
  const list = rec.lists.find(l => l.id === listId)
  if (!list) return c.json({ error: 'List not found' }, 404)

  list.name = name
  list.updatedAt = new Date().toISOString()
  await saveLists(c.env, userId, rec)
  return c.json({ list: serializeList(c, list) })
})

// DELETE /lists/:listId — delete a list and its feed token. Refuses to delete
// the user's last remaining list.
listsRoutes.delete('/:listId', async (c) => {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const listId = c.req.param('listId')
  const rec = await getLists(c.env, userId)
  const idx = rec.lists.findIndex(l => l.id === listId)
  if (idx === -1) return c.json({ error: 'List not found' }, 404)
  if (rec.lists.length <= 1) {
    return c.json({ error: 'Cannot delete your last list' }, 400)
  }

  const [removed] = rec.lists.splice(idx, 1)
  await saveLists(c.env, userId, rec)
  if (removed.feedToken) {
    await c.env.FEED_TOKENS.delete(removed.feedToken)
  }
  return c.json({ ok: true })
})

// Per-list item routes — reuse the same handlers as the back-compat aliases,
// passing the resolved listId.
const lid = (c: Context<{ Bindings: Env }>) => c.req.param('listId')

listsRoutes.get('/:listId/favorites', (c) => handleGetFavorites(c, lid(c)))
listsRoutes.put('/:listId/favorites', (c) => handlePutFavorites(c, lid(c)))
listsRoutes.post('/:listId/favorites/:icsUrl', (c) => handleAddFavorite(c, lid(c)))
listsRoutes.delete('/:listId/favorites/:icsUrl', (c) => handleDeleteFavorite(c, lid(c)))

listsRoutes.get('/:listId/search-filters', (c) => handleGetSearchFilters(c, lid(c)))
listsRoutes.put('/:listId/search-filters', (c) => handlePutSearchFilters(c, lid(c)))
listsRoutes.post('/:listId/search-filters', (c) => handleAddSearchFilter(c, lid(c)))
listsRoutes.delete('/:listId/search-filters/:filter', (c) => handleDeleteSearchFilter(c, lid(c)))

listsRoutes.get('/:listId/geo-filters', (c) => handleGetGeoFilters(c, lid(c)))
listsRoutes.post('/:listId/geo-filters', (c) => handleAddGeoFilter(c, lid(c)))
listsRoutes.put('/:listId/geo-filters', (c) => handlePutGeoFilters(c, lid(c)))
listsRoutes.delete('/:listId/geo-filters/:index', (c) => handleDeleteGeoFilter(c, lid(c)))
