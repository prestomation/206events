import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Env } from './types.js'
import { requireAuth, getListContext, saveLists } from './favorites-helpers.js'

const MAX_SEARCH_FILTERS = 25
const MAX_FILTER_LENGTH = 200

function isValidFilter(filter: unknown): filter is string {
  return typeof filter === 'string' && filter.trim().length > 0 && filter.length <= MAX_FILTER_LENGTH && !filter.includes('/')
}

// `listId` is undefined for the back-compat alias routes (default/first list)
// and the path param for `/lists/:listId/search-filters`.

export async function handleGetSearchFilters(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)
  return c.json({ searchFilters: ctx.list.searchFilters, updatedAt: ctx.list.updatedAt })
}

export async function handlePutSearchFilters(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { searchFilters: string[] }
  try {
    body = await c.req.json() as { searchFilters: string[] }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (!Array.isArray(body.searchFilters)) {
    return c.json({ error: 'searchFilters must be an array' }, 400)
  }
  if (body.searchFilters.length > MAX_SEARCH_FILTERS) {
    return c.json({ error: `Too many search filters (max ${MAX_SEARCH_FILTERS})` }, 400)
  }

  const trimmed: string[] = []
  const seen = new Set<string>()
  for (const f of body.searchFilters) {
    if (!isValidFilter(f)) {
      return c.json({ error: 'Invalid search filter: must be a non-empty string (max 200 chars)' }, 400)
    }
    const key = f.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      trimmed.push(f.trim())
    }
  }

  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)
  ctx.list.searchFilters = trimmed
  ctx.list.updatedAt = new Date().toISOString()
  await saveLists(c.env, userId, ctx.rec)
  return c.json({ searchFilters: ctx.list.searchFilters, updatedAt: ctx.list.updatedAt })
}

export async function handleAddSearchFilter(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { filter: string }
  try {
    body = await c.req.json() as { filter: string }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (!isValidFilter(body.filter)) {
    return c.json({ error: 'Invalid search filter' }, 400)
  }

  const filter = body.filter.trim()
  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)
  if (ctx.list.searchFilters.length >= MAX_SEARCH_FILTERS) {
    return c.json({ error: 'Maximum search filters limit reached' }, 400)
  }

  const exists = ctx.list.searchFilters.some(f => f.toLowerCase() === filter.toLowerCase())
  if (!exists) {
    ctx.list.searchFilters.push(filter)
    ctx.list.updatedAt = new Date().toISOString()
    await saveLists(c.env, userId, ctx.rec)
  }

  return c.json({ searchFilters: ctx.list.searchFilters, updatedAt: ctx.list.updatedAt })
}

export async function handleDeleteSearchFilter(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const filter = decodeURIComponent(c.req.param('filter'))
  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)

  ctx.list.searchFilters = ctx.list.searchFilters.filter(
    f => f.toLowerCase() !== filter.toLowerCase()
  )
  ctx.list.updatedAt = new Date().toISOString()
  await saveLists(c.env, userId, ctx.rec)

  return c.json({ searchFilters: ctx.list.searchFilters, updatedAt: ctx.list.updatedAt })
}

// Back-compat alias routes — operate on the user's default (first) list.
export const searchFiltersRoutes = new Hono<{ Bindings: Env }>()
searchFiltersRoutes.get('/', (c) => handleGetSearchFilters(c))
searchFiltersRoutes.put('/', (c) => handlePutSearchFilters(c))
searchFiltersRoutes.post('/', (c) => handleAddSearchFilter(c))
searchFiltersRoutes.delete('/:filter', (c) => handleDeleteSearchFilter(c))
