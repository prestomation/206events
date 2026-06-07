import { describe, it, expect, beforeEach, vi } from 'vitest'
import app from '../src/index.js'
import { signJWT } from '../src/jwt.js'

function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  }
}

const JWT_SECRET = 'test-jwt-secret'
const USER_ID = 'user:google:123'
const FEED_TOKEN = 'existing-default-token'

async function makeAuthCookie(userId = USER_ID) {
  const token = await signJWT({ sub: userId }, JWT_SECRET, 3600)
  return `session=${token}`
}

function createEnv() {
  return {
    USERS: createMockKV(),
    FAVORITES: createMockKV(),
    FEED_TOKENS: createMockKV(),
    JWT_SECRET,
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GITHUB_PAGES_BASE_URL: 'https://prestomation.github.io/calendar-ripper',
    SITE_URL: 'https://prestomation.github.io/calendar-ripper',
  }
}

// Seed a USERS record so the lazy migration / feed-url construction has a real
// feed token to reuse for the default list.
function seedUser(env: ReturnType<typeof createEnv>, feedToken = FEED_TOKEN) {
  env.USERS._store.set(USER_ID, JSON.stringify({
    id: USER_ID,
    provider: 'google',
    providerId: '123',
    email: 'a@b.com',
    name: 'Test',
    picture: '',
    feedToken,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: '2026-01-01T00:00:00Z',
  }))
  env.FEED_TOKENS._store.set(feedToken, JSON.stringify({ userId: USER_ID }))
}

interface ListJson {
  id: string
  name: string
  feedUrl: string
  icsUrls: string[]
  searchFilters: string[]
  geoFilters: unknown[]
}

describe('Lists API', () => {
  let env: ReturnType<typeof createEnv>

  beforeEach(() => {
    env = createEnv()
    seedUser(env)
  })

  it('GET /lists returns 401 without auth', async () => {
    const res = await app.request('/lists', {}, env)
    expect(res.status).toBe(401)
  })

  it('GET /lists lazily creates a default list for a new user', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/lists', { headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(200)
    const data = await res.json() as { lists: ListJson[] }
    expect(data.lists).toHaveLength(1)
    expect(data.lists[0].id).toBe('default')
    expect(data.lists[0].name).toBe('My Favorites')
    // The default list reuses the user's existing feed token.
    expect(data.lists[0].feedUrl).toContain(`/feed/${FEED_TOKEN}.ics`)
  })

  it('GET /lists migrates an old flat FAVORITES record into the default list', async () => {
    env.FAVORITES._store.set(USER_ID, JSON.stringify({
      icsUrls: ['stoup_brewing-all-events.ics'],
      searchFilters: ['Jazz'],
      geoFilters: [],
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    const cookie = await makeAuthCookie()
    const res = await app.request('/lists', { headers: { Cookie: cookie } }, env)
    const data = await res.json() as { lists: ListJson[] }
    expect(data.lists).toHaveLength(1)
    expect(data.lists[0].id).toBe('default')
    expect(data.lists[0].icsUrls).toEqual(['stoup_brewing-all-events.ics'])
    expect(data.lists[0].searchFilters).toEqual(['Jazz'])
    expect(data.lists[0].feedUrl).toContain(`/feed/${FEED_TOKEN}.ics`)

    // The migrated shape is persisted, and the default token now carries listId.
    const stored = JSON.parse(env.FAVORITES._store.get(USER_ID)!)
    expect(Array.isArray(stored.lists)).toBe(true)
    const tokenRec = JSON.parse(env.FEED_TOKENS._store.get(FEED_TOKEN)!)
    expect(tokenRec.listId).toBe('default')
  })

  it('POST /lists creates a new list with its own feed token', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/lists', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Date Night' }),
    }, env)
    expect(res.status).toBe(201)
    const data = await res.json() as { list: ListJson }
    expect(data.list.name).toBe('Date Night')
    expect(data.list.id).not.toBe('default')
    // New list's feed URL uses a freshly minted token (not the default one).
    expect(data.list.feedUrl).not.toContain(FEED_TOKEN)

    // A FEED_TOKENS reverse-lookup entry was written pointing at this list.
    const token = data.list.feedUrl.split('/feed/')[1].replace('.ics', '')
    const tokenRec = JSON.parse(env.FEED_TOKENS._store.get(token)!)
    expect(tokenRec).toEqual({ userId: USER_ID, listId: data.list.id })

    // GET now returns two lists.
    const listRes = await app.request('/lists', { headers: { Cookie: cookie } }, env)
    const listData = await listRes.json() as { lists: ListJson[] }
    expect(listData.lists).toHaveLength(2)
  })

  it('POST /lists rejects an empty name', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/lists', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    }, env)
    expect(res.status).toBe(400)
  })

  it('POST /lists enforces the MAX_LISTS cap of 10', async () => {
    const cookie = await makeAuthCookie()
    // Default list already exists (lazily created on first read) → create 9 more
    // to reach 10, then the 11th must be rejected.
    for (let i = 0; i < 9; i++) {
      const res = await app.request('/lists', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `List ${i}` }),
      }, env)
      expect(res.status).toBe(201)
    }

    const overflow = await app.request('/lists', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'One too many' }),
    }, env)
    expect(overflow.status).toBe(400)
    const data = await overflow.json() as { error: string }
    expect(data.error).toContain('max 10')

    const listRes = await app.request('/lists', { headers: { Cookie: cookie } }, env)
    const listData = await listRes.json() as { lists: ListJson[] }
    expect(listData.lists).toHaveLength(10)
  })

  it('PATCH /lists/:listId renames a list', async () => {
    const cookie = await makeAuthCookie()
    const createRes = await app.request('/lists', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Old Name' }),
    }, env)
    const created = (await createRes.json() as { list: ListJson }).list

    const res = await app.request(`/lists/${created.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    }, env)
    expect(res.status).toBe(200)
    const data = await res.json() as { list: ListJson }
    expect(data.list.name).toBe('New Name')
  })

  it('PATCH /lists/:listId returns 404 for an unknown list', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/lists/nonexistent', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    }, env)
    expect(res.status).toBe(404)
  })

  it('DELETE /lists/:listId removes a list and its feed token', async () => {
    const cookie = await makeAuthCookie()
    const createRes = await app.request('/lists', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Temp' }),
    }, env)
    const created = (await createRes.json() as { list: ListJson }).list
    const token = created.feedUrl.split('/feed/')[1].replace('.ics', '')
    expect(env.FEED_TOKENS._store.has(token)).toBe(true)

    const res = await app.request(`/lists/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env)
    expect(res.status).toBe(200)
    expect(env.FEED_TOKENS._store.has(token)).toBe(false)

    const listRes = await app.request('/lists', { headers: { Cookie: cookie } }, env)
    const listData = await listRes.json() as { lists: ListJson[] }
    expect(listData.lists).toHaveLength(1)
  })

  it('DELETE /lists/:listId refuses to delete the last remaining list', async () => {
    const cookie = await makeAuthCookie()
    // Trigger default-list creation.
    await app.request('/lists', { headers: { Cookie: cookie } }, env)
    const res = await app.request('/lists/default', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    }, env)
    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toContain('last list')
  })

  it('per-list favorites are isolated from the default list', async () => {
    const cookie = await makeAuthCookie()
    const createRes = await app.request('/lists', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Kids' }),
    }, env)
    const created = (await createRes.json() as { list: ListJson }).list

    // Add a favorite to the new list only.
    const addRes = await app.request(`/lists/${created.id}/favorites/tag-music.ics`, {
      method: 'POST',
      headers: { Cookie: cookie },
    }, env)
    expect(addRes.status).toBe(200)

    // New list has it.
    const listFavRes = await app.request(`/lists/${created.id}/favorites`, { headers: { Cookie: cookie } }, env)
    expect((await listFavRes.json() as { favorites: string[] }).favorites).toEqual(['tag-music.ics'])

    // Default list (via alias) does NOT have it.
    const aliasRes = await app.request('/favorites', { headers: { Cookie: cookie } }, env)
    expect((await aliasRes.json() as { favorites: string[] }).favorites).toEqual([])
  })

  it('per-list search filters and geo filters route to the right list', async () => {
    const cookie = await makeAuthCookie()
    const created = (await (await app.request('/lists', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Work' }),
    }, env)).json() as { list: ListJson }).list

    await app.request(`/lists/${created.id}/search-filters`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'Tech' }),
    }, env)
    await app.request(`/lists/${created.id}/geo-filters`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 47.6, lng: -122.3, radiusKm: 5 }),
    }, env)

    const sfRes = await app.request(`/lists/${created.id}/search-filters`, { headers: { Cookie: cookie } }, env)
    expect((await sfRes.json() as { searchFilters: string[] }).searchFilters).toEqual(['Tech'])
    const gfRes = await app.request(`/lists/${created.id}/geo-filters`, { headers: { Cookie: cookie } }, env)
    expect((await gfRes.json() as { geoFilters: unknown[] }).geoFilters).toHaveLength(1)

    // Default list is untouched.
    const defSf = await app.request('/search-filters', { headers: { Cookie: cookie } }, env)
    expect((await defSf.json() as { searchFilters: string[] }).searchFilters).toEqual([])
  })

  it('item routes 404 when the listId does not exist', async () => {
    const cookie = await makeAuthCookie()
    const res = await app.request('/lists/ghost/favorites', { headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(404)
  })
})
