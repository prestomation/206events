import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import app, { isAllowedOrigin } from '../src/index.js'
import { isAllowedReturnUrl, isAllowedHandoffOrigin } from '../src/auth.js'
import { signHandoffTicket, verifyHandoffTicket } from '../src/handoff.js'
import { verifyJWT } from '../src/jwt.js'

function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  }
}

const STAGING_ORIGIN = 'https://api-staging.206.events'
const HANDOFF_SECRET = 'test-handoff-secret'

const mockEnv = {
  USERS: createMockKV(),
  FAVORITES: createMockKV(),
  FEED_TOKENS: createMockKV(),
  JWT_SECRET: 'test-jwt-secret',
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GITHUB_PAGES_BASE_URL: 'https://prestomation.github.io/calendar-ripper',
  SITE_URL: 'https://prestomation.github.io/calendar-ripper',
  STAGING_ORIGIN,
  HANDOFF_SECRET,
}

// Stub Google's token + userinfo endpoints so /auth/callback can run end-to-end.
function stubGoogleFetch(profile: { id: string; email: string; name: string; picture: string }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'test-access-token' }), { status: 200 })
    }
    if (u.includes('googleapis.com/oauth2/v2/userinfo')) {
      return new Response(JSON.stringify(profile), { status: 200 })
    }
    throw new Error(`unexpected fetch: ${u}`)
  }))
}

// Drive /auth/callback with a matching nonce cookie so CSRF validation passes.
async function runCallback(state: object, env: Record<string, unknown>) {
  const nonce = 'cb-nonce'
  const stateStr = JSON.stringify({ nonce, ...state })
  return app.request(
    `/auth/callback?code=test-code&state=${encodeURIComponent(stateStr)}`,
    { method: 'GET', headers: { Cookie: `oauth_nonce=${nonce}` } },
    env,
  )
}

// All Set-Cookie headers on a response (the callback appends more than one).
function setCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] }
  if (h.getSetCookie) return h.getSetCookie()
  const single = h.get('Set-Cookie')
  return single ? [single] : []
}

describe('isAllowedReturnUrl', () => {
  it('accepts existing prod/github/localhost prefixes', () => {
    expect(isAllowedReturnUrl('https://206.events/')).toBe(true)
    expect(isAllowedReturnUrl('https://prestomation.github.io/calendar-ripper/')).toBe(true)
    expect(isAllowedReturnUrl('http://localhost:5173/')).toBe(true)
  })

  it('accepts Pages preview subdomains for this project', () => {
    expect(isAllowedReturnUrl('https://pr-7.206events.pages.dev/')).toBe(true)
    expect(isAllowedReturnUrl('https://206events.pages.dev/preview')).toBe(true)
    expect(isAllowedReturnUrl('https://abc123.206events.pages.dev/x')).toBe(true)
  })

  it('rejects other pages.dev projects and non-https previews', () => {
    expect(isAllowedReturnUrl('https://evil.pages.dev/')).toBe(false)
    expect(isAllowedReturnUrl('https://206events.pages.dev.evil.com/')).toBe(false)
    expect(isAllowedReturnUrl('http://pr-7.206events.pages.dev/')).toBe(false)
    expect(isAllowedReturnUrl('not-a-url')).toBe(false)
  })
})

describe('isAllowedHandoffOrigin', () => {
  it('accepts only the exact configured staging origin', () => {
    expect(isAllowedHandoffOrigin(STAGING_ORIGIN, { STAGING_ORIGIN })).toBe(true)
    expect(isAllowedHandoffOrigin('https://api-staging.206.events/', { STAGING_ORIGIN })).toBe(true)
  })

  it('rejects other origins and non-https', () => {
    expect(isAllowedHandoffOrigin('https://evil.example.com', { STAGING_ORIGIN })).toBe(false)
    expect(isAllowedHandoffOrigin('http://api-staging.206.events', { STAGING_ORIGIN })).toBe(false)
    expect(isAllowedHandoffOrigin('not-a-url', { STAGING_ORIGIN })).toBe(false)
  })

  it('is inert when STAGING_ORIGIN is unset (production default)', () => {
    expect(isAllowedHandoffOrigin(STAGING_ORIGIN, { STAGING_ORIGIN: undefined })).toBe(false)
  })
})

describe('Auth endpoints', () => {
  beforeEach(() => {
    mockEnv.USERS = createMockKV()
    mockEnv.FAVORITES = createMockKV()
    mockEnv.FEED_TOKENS = createMockKV()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET /auth/login redirects to Google OAuth with CSRF nonce', async () => {
    const res = await app.request(
      '/auth/login?provider=google',
      { method: 'GET' },
      mockEnv
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    expect(location).toContain('accounts.google.com/o/oauth2')
    expect(location).toContain('client_id=test-client-id')

    // Verify CSRF nonce cookie is set
    const setCookie = res.headers.get('Set-Cookie')!
    expect(setCookie).toContain('oauth_nonce=')
    expect(setCookie).toContain('HttpOnly')

    // Verify state parameter contains JSON with nonce
    const stateMatch = location.match(/state=([^&]+)/)
    expect(stateMatch).not.toBeNull()
    const state = JSON.parse(decodeURIComponent(stateMatch![1]))
    expect(state.nonce).toBeTruthy()
  })

  it('GET /auth/login includes return_to in state when valid', async () => {
    const returnTo = encodeURIComponent('https://prestomation.github.io/calendar-ripper/preview/106/')
    const res = await app.request(
      `/auth/login?provider=google&return_to=${returnTo}`,
      { method: 'GET' },
      mockEnv
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    const stateMatch = location.match(/state=([^&]+)/)
    const state = JSON.parse(decodeURIComponent(stateMatch![1]))
    expect(state.returnTo).toContain('prestomation.github.io/calendar-ripper/preview/')
  })

  it('GET /auth/callback rejects missing CSRF nonce', async () => {
    const state = JSON.stringify({ nonce: 'test-nonce', returnTo: '' })
    const res = await app.request(
      `/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
      { method: 'GET' },
      mockEnv
    )
    // No oauth_nonce cookie sent, so nonce validation should fail
    expect(res.status).toBe(403)
    const data = await res.json() as { error: string }
    expect(data.error).toContain('Invalid OAuth state')
  })

  it('GET /auth/callback rejects mismatched CSRF nonce', async () => {
    const state = JSON.stringify({ nonce: 'correct-nonce', returnTo: '' })
    const res = await app.request(
      `/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
      {
        method: 'GET',
        headers: { Cookie: 'oauth_nonce=wrong-nonce' },
      },
      mockEnv
    )
    expect(res.status).toBe(403)
    const data = await res.json() as { error: string }
    expect(data.error).toContain('Invalid OAuth state')
  })

  it('GET /auth/login returns 400 for unsupported provider', async () => {
    const res = await app.request(
      '/auth/login?provider=facebook',
      { method: 'GET' },
      mockEnv
    )
    expect(res.status).toBe(400)
  })

  it('GET /auth/me returns 401 without session cookie', async () => {
    const res = await app.request('/auth/me', { method: 'GET' }, mockEnv)
    expect(res.status).toBe(401)
  })

  it('POST /auth/logout clears session cookie', async () => {
    const res = await app.request('/auth/logout', { method: 'POST' }, mockEnv)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('Set-Cookie')!
    expect(setCookie).toContain('session=')
    expect(setCookie).toContain('Max-Age=0')
  })

  it('GET /auth/login threads an allowlisted handoff origin into state', async () => {
    const res = await app.request(
      `/auth/login?provider=google&handoff=${encodeURIComponent(STAGING_ORIGIN)}`,
      { method: 'GET' },
      mockEnv,
    )
    const location = res.headers.get('Location')!
    const state = JSON.parse(decodeURIComponent(location.match(/state=([^&]+)/)![1]))
    expect(state.handoff).toBe(STAGING_ORIGIN)
  })

  it('GET /auth/login drops a non-allowlisted handoff origin', async () => {
    const res = await app.request(
      `/auth/login?provider=google&handoff=${encodeURIComponent('https://evil.example.com')}`,
      { method: 'GET' },
      mockEnv,
    )
    const location = res.headers.get('Location')!
    const state = JSON.parse(decodeURIComponent(location.match(/state=([^&]+)/)![1]))
    expect(state.handoff).toBe('')
  })

  it('GET /auth/callback with handoff bounces to the staging worker without a prod session cookie', async () => {
    stubGoogleFetch({ id: 'g-1', email: 'a@b.com', name: 'Ada', picture: 'https://img/x.png' })
    const returnTo = 'https://pr-7.206events.pages.dev/'
    const res = await runCallback({ returnTo, handoff: STAGING_ORIGIN }, mockEnv)

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    expect(location.startsWith(`${STAGING_ORIGIN}/auth/handoff?`)).toBe(true)

    const dest = new URL(location)
    expect(dest.searchParams.get('return_to')).toBe(returnTo)

    // The session lives on the staging host, not prod: no session cookie here.
    const cookies = setCookies(res)
    expect(cookies.some(c => c.startsWith('session='))).toBe(false)

    // The ticket carries the authenticated identity and verifies with the shared secret.
    const ticket = await verifyHandoffTicket(dest.searchParams.get('ticket')!, HANDOFF_SECRET)
    expect(ticket).toMatchObject({ sub: 'user:google:g-1', email: 'a@b.com' })
  })

  it('GET /auth/callback without handoff still sets the prod session cookie', async () => {
    stubGoogleFetch({ id: 'g-2', email: 'c@d.com', name: 'Bo', picture: 'https://img/y.png' })
    const res = await runCallback({ returnTo: 'https://206.events/' }, mockEnv)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://206.events/')
    const cookies = setCookies(res)
    expect(cookies.some(c => c.startsWith('session='))).toBe(true)
  })

  it('GET /auth/callback ignores handoff when HANDOFF_SECRET is unset (inert in prod)', async () => {
    stubGoogleFetch({ id: 'g-3', email: 'e@f.com', name: 'Cy', picture: 'https://img/z.png' })
    const envNoSecret = { ...mockEnv, HANDOFF_SECRET: undefined }
    const res = await runCallback({ returnTo: 'https://206.events/', handoff: STAGING_ORIGIN }, envNoSecret)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://206.events/')
    const cookies = setCookies(res)
    expect(cookies.some(c => c.startsWith('session='))).toBe(true)
  })

  it('staging /auth/login delegates to prod with a handoff param', async () => {
    const stagingEnv = { ...mockEnv, AUTH_MODE: 'staging', PROD_AUTH_ORIGIN: 'https://api.206.events' }
    const returnTo = 'https://pr-7.206events.pages.dev/'
    const res = await app.request(
      `/auth/login?provider=google&return_to=${encodeURIComponent(returnTo)}`,
      { method: 'GET' },
      stagingEnv,
    )
    expect(res.status).toBe(302)
    const dest = new URL(res.headers.get('Location')!)
    expect(dest.origin).toBe('https://api.206.events')
    expect(dest.pathname).toBe('/auth/login')
    expect(dest.searchParams.get('handoff')).toBe(STAGING_ORIGIN)
    expect(dest.searchParams.get('return_to')).toBe(returnTo)
    // Delegation must not start a Google flow or set a nonce on the staging host.
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('staging /auth/handoff consumes a ticket, seeds the staging user, sets a session, and redirects', async () => {
    const stagingEnv = { ...mockEnv, AUTH_MODE: 'staging' }
    const ticket = await signHandoffTicket(
      { sub: 'user:google:g-9', email: 'h@i.com', name: 'Di', picture: 'https://img/h.png' },
      HANDOFF_SECRET,
    )
    const returnTo = 'https://pr-9.206events.pages.dev/'
    const res = await app.request(
      `/auth/handoff?ticket=${encodeURIComponent(ticket)}&return_to=${encodeURIComponent(returnTo)}`,
      { method: 'GET' },
      stagingEnv,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(returnTo)

    // A session cookie signed with the staging worker's own JWT_SECRET is set here.
    const sessionCookie = setCookies(res).find(c => c.startsWith('session='))
    expect(sessionCookie).toBeDefined()
    const token = sessionCookie!.split(';')[0].slice('session='.length)
    expect(await verifyJWT(token, mockEnv.JWT_SECRET)).toMatchObject({ sub: 'user:google:g-9' })

    // The user + default list were seeded into the (staging) KV.
    expect(await mockEnv.USERS.get('user:google:g-9')).toBeTruthy()
    expect(await mockEnv.FAVORITES.get('user:google:g-9')).toBeTruthy()
  })

  it('staging /auth/handoff rejects a replayed ticket (one-time use via RATE_LIMIT)', async () => {
    const stagingEnv = { ...mockEnv, AUTH_MODE: 'staging', RATE_LIMIT: createMockKV() }
    const ticket = await signHandoffTicket(
      { sub: 'user:google:g-rp', email: 'r@p.com', name: 'Re', picture: 'https://img/r.png' },
      HANDOFF_SECRET,
    )
    const url = `/auth/handoff?ticket=${encodeURIComponent(ticket)}&return_to=${encodeURIComponent('https://pr-1.206events.pages.dev/')}`
    const first = await app.request(url, { method: 'GET' }, stagingEnv)
    expect(first.status).toBe(302)
    // Same ticket again within its TTL → rejected.
    const second = await app.request(url, { method: 'GET' }, stagingEnv)
    expect(second.status).toBe(403)
  })

  it('staging /auth/handoff falls back to SITE_URL when return_to is not allowlisted', async () => {
    const stagingEnv = { ...mockEnv, AUTH_MODE: 'staging' }
    const ticket = await signHandoffTicket(
      { sub: 'user:google:g-8', email: 'j@k.com', name: 'El', picture: 'https://img/j.png' },
      HANDOFF_SECRET,
    )
    const res = await app.request(
      `/auth/handoff?ticket=${encodeURIComponent(ticket)}&return_to=${encodeURIComponent('https://evil.example.com/')}`,
      { method: 'GET' },
      stagingEnv,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe(stagingEnv.SITE_URL)
  })

  it('staging /auth/handoff rejects an invalid ticket', async () => {
    const stagingEnv = { ...mockEnv, AUTH_MODE: 'staging' }
    const res = await app.request('/auth/handoff?ticket=not-a-real-ticket', { method: 'GET' }, stagingEnv)
    expect(res.status).toBe(403)
  })

  it('staging /auth/handoff rejects a ticket signed with the wrong secret', async () => {
    const stagingEnv = { ...mockEnv, AUTH_MODE: 'staging' }
    const ticket = await signHandoffTicket(
      { sub: 'user:google:g-x', email: 'x@y.com', name: 'Ex', picture: 'https://img/e.png' },
      'a-different-secret',
    )
    const res = await app.request(`/auth/handoff?ticket=${encodeURIComponent(ticket)}`, { method: 'GET' }, stagingEnv)
    expect(res.status).toBe(403)
  })

  it('/auth/handoff is 404 in prod mode (consumer inert without AUTH_MODE=staging)', async () => {
    const ticket = await signHandoffTicket(
      { sub: 'user:google:g-z', email: 'z@z.com', name: 'Ze', picture: 'https://img/z.png' },
      HANDOFF_SECRET,
    )
    const res = await app.request(`/auth/handoff?ticket=${encodeURIComponent(ticket)}`, { method: 'GET' }, mockEnv)
    expect(res.status).toBe(404)
  })
})

describe('isAllowedOrigin (CORS)', () => {
  it('allows prod, staging, localhost, and Pages preview origins', () => {
    expect(isAllowedOrigin('https://206.events')).toBe('https://206.events')
    expect(isAllowedOrigin('https://api-staging.206.events')).toBe('https://api-staging.206.events')
    expect(isAllowedOrigin('https://pr-7.206events.pages.dev')).toBe('https://pr-7.206events.pages.dev')
    expect(isAllowedOrigin('https://206events.pages.dev')).toBe('https://206events.pages.dev')
    expect(isAllowedOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('denies other origins, look-alikes, and non-https previews', () => {
    expect(isAllowedOrigin('https://evil.pages.dev')).toBe('')
    expect(isAllowedOrigin('https://206events.pages.dev.evil.com')).toBe('')
    expect(isAllowedOrigin('http://pr-7.206events.pages.dev')).toBe('')
    expect(isAllowedOrigin(undefined)).toBe('')
  })
})
