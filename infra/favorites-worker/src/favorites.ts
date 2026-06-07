import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Env } from './types.js'
import { requireAuth, getListContext, saveLists } from './favorites-helpers.js'

const MAX_FAVORITES = 1000
const MAX_URL_LENGTH = 2048

function isValidIcsUrl(url: string): boolean {
  return typeof url === 'string' && url.length <= MAX_URL_LENGTH && url.endsWith('.ics') && !url.includes('://') && !url.includes('..')
}

// Each handler resolves a single list. `listId` is undefined for the
// back-compat alias routes (operates on the user's default/first list) and the
// path param for the per-list `/lists/:listId/favorites` routes.

export async function handleGetFavorites(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)
  return c.json({ favorites: ctx.list.icsUrls, updatedAt: ctx.list.updatedAt })
}

export async function handlePutFavorites(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  let body: { favorites: string[] }
  try {
    body = await c.req.json() as { favorites: string[] }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (!Array.isArray(body.favorites)) {
    return c.json({ error: 'favorites must be an array' }, 400)
  }
  if (body.favorites.length > MAX_FAVORITES) {
    return c.json({ error: `Too many favorites (max ${MAX_FAVORITES})` }, 400)
  }
  for (const url of body.favorites) {
    if (!isValidIcsUrl(url)) {
      return c.json({ error: 'Invalid favorite: must be a relative .ics path' }, 400)
    }
  }

  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)
  ctx.list.icsUrls = body.favorites
  ctx.list.updatedAt = new Date().toISOString()
  await saveLists(c.env, userId, ctx.rec)
  return c.json({ favorites: ctx.list.icsUrls, updatedAt: ctx.list.updatedAt })
}

export async function handleAddFavorite(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const icsUrl = c.req.param('icsUrl')
  if (!isValidIcsUrl(icsUrl)) {
    return c.json({ error: 'Invalid ICS URL' }, 400)
  }

  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)
  if (ctx.list.icsUrls.length >= MAX_FAVORITES) {
    return c.json({ error: 'Maximum favorites limit reached' }, 400)
  }

  if (!ctx.list.icsUrls.includes(icsUrl)) {
    ctx.list.icsUrls.push(icsUrl)
    ctx.list.updatedAt = new Date().toISOString()
    await saveLists(c.env, userId, ctx.rec)
  }

  return c.json({ favorites: ctx.list.icsUrls, updatedAt: ctx.list.updatedAt })
}

export async function handleDeleteFavorite(c: Context<{ Bindings: Env }>, listId?: string) {
  const userId = await requireAuth(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const icsUrl = c.req.param('icsUrl')
  const ctx = await getListContext(c.env, userId, listId)
  if (!ctx) return c.json({ error: 'List not found' }, 404)

  ctx.list.icsUrls = ctx.list.icsUrls.filter(u => u !== icsUrl)
  ctx.list.updatedAt = new Date().toISOString()
  await saveLists(c.env, userId, ctx.rec)

  return c.json({ favorites: ctx.list.icsUrls, updatedAt: ctx.list.updatedAt })
}

// Back-compat alias routes — operate on the user's default (first) list.
export const favoritesRoutes = new Hono<{ Bindings: Env }>()
favoritesRoutes.get('/', (c) => handleGetFavorites(c))
favoritesRoutes.put('/', (c) => handlePutFavorites(c))
favoritesRoutes.post('/:icsUrl', (c) => handleAddFavorite(c))
favoritesRoutes.delete('/:icsUrl', (c) => handleDeleteFavorite(c))
