import { Hono } from 'hono'
import type { Env, UserRecord, UserListsRecord } from './types.js'
import { signJWT } from './jwt.js'
import { signHandoffTicket } from './handoff.js'
import { extractUserId } from './auth-middleware.js'
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from './favorites-helpers.js'

export const authRoutes = new Hono<{ Bindings: Env }>()

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

// Allowed URL prefixes for post-login redirect
const ALLOWED_RETURN_PREFIXES = [
  'https://206.events/',
  'https://prestomation.github.io/',
  'http://localhost:',
  'http://localhost/',
  'http://127.0.0.1:',
  'http://127.0.0.1/',
]

// Cloudflare Pages preview deployments for this project live under
// <branch>.206events.pages.dev. Scoped to this exact project subdomain — never
// bare *.pages.dev, which is shared across every Cloudflare account.
const PREVIEW_PAGES_SUFFIX = '.206events.pages.dev'
const PREVIEW_PAGES_HOST = '206events.pages.dev'

export function isAllowedReturnUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (ALLOWED_RETURN_PREFIXES.some(prefix => url.startsWith(prefix))) return true
    if (u.protocol === 'https:' && (u.hostname === PREVIEW_PAGES_HOST || u.hostname.endsWith(PREVIEW_PAGES_SUFFIX))) {
      return true
    }
    return false
  } catch {
    return false
  }
}

// The handoff ticket may only be sent to the one configured staging origin
// (exact origin match, https only). Returns false when STAGING_ORIGIN is unset,
// which keeps the handoff path inert in production until it is configured.
export function isAllowedHandoffOrigin(value: string, env: Pick<Env, 'STAGING_ORIGIN'>): boolean {
  if (!env.STAGING_ORIGIN) return false
  try {
    const got = new URL(value)
    const want = new URL(env.STAGING_ORIGIN)
    return got.protocol === 'https:' && got.origin === want.origin
  } catch {
    return false
  }
}

authRoutes.get('/login', (c) => {
  const provider = c.req.query('provider')
  if (provider !== 'google') {
    return c.json({ error: 'Unsupported provider' }, 400)
  }

  const returnTo = c.req.query('return_to') || ''
  // Optional cross-worker handoff: when a preview build initiates login it asks
  // prod to bounce the authenticated session to the staging worker's origin.
  // Only an exact-allowlisted origin is carried through; anything else is dropped.
  const handoff = c.req.query('handoff') || ''
  const nonce = crypto.randomUUID()
  const state = JSON.stringify({
    nonce,
    returnTo: returnTo && isAllowedReturnUrl(returnTo) ? returnTo : '',
    handoff: handoff && isAllowedHandoffOrigin(handoff, c.env) ? handoff : '',
  })

  const callbackUrl = new URL('/auth/callback', c.req.url).toString()
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  })

  const response = c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
  response.headers.append('Set-Cookie', `oauth_nonce=${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`)
  return response
})

authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'Missing code' }, 400)

  // Validate CSRF nonce from state parameter against cookie
  let returnTo = ''
  let handoff = ''
  const stateRaw = c.req.query('state') || ''
  if (stateRaw) {
    try {
      const state = JSON.parse(stateRaw) as { nonce?: string; returnTo?: string; handoff?: string }
      const cookies = Object.fromEntries(
        (c.req.header('Cookie') || '').split(';').map(s => {
          const [k, ...v] = s.trim().split('=')
          return [k, v.join('=')]
        })
      )
      if (!state.nonce || cookies.oauth_nonce !== state.nonce) {
        return c.json({ error: 'Invalid OAuth state' }, 403)
      }
      returnTo = state.returnTo || ''
      handoff = state.handoff || ''
    } catch {
      return c.json({ error: 'Invalid OAuth state' }, 403)
    }
  }

  const callbackUrl = new URL('/auth/callback', c.req.url).toString()

  // Exchange code for access token
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return c.json({ error: 'Token exchange failed' }, 502)
  const tokenData = await tokenRes.json() as { access_token: string }

  // Fetch user profile
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!userRes.ok) return c.json({ error: 'User info fetch failed' }, 502)
  const profile = await userRes.json() as { id: string; email: string; name: string; picture: string }

  const userId = `user:google:${profile.id}`
  const now = new Date().toISOString()

  // Check if user already exists
  let user: UserRecord | null = null
  const existingRaw = await c.env.USERS.get(userId)
  if (existingRaw) {
    user = JSON.parse(existingRaw) as UserRecord
    user.lastLoginAt = now
    user.email = profile.email
    user.name = profile.name
    user.picture = profile.picture
  } else {
    // New user — generate feed token
    const feedToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    user = {
      id: userId,
      provider: 'google',
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      feedToken,
      createdAt: now,
      lastLoginAt: now,
    }
    // Seed the user's lists with a single default list that reuses this token,
    // so its ICS URL equals the feedUrl surfaced by /auth/me.
    const listsRecord: UserListsRecord = {
      lists: [{
        id: DEFAULT_LIST_ID,
        name: DEFAULT_LIST_NAME,
        feedToken,
        icsUrls: [],
        searchFilters: [],
        geoFilters: [],
        createdAt: now,
        updatedAt: now,
      }],
      updatedAt: now,
    }
    // Write the list record (the target) BEFORE the FEED_TOKENS reverse-lookup
    // (the pointer). If the second write fails, a token that points at a missing
    // list serves an empty feed; the reverse — a pointer with no target — would
    // be unrecoverable. Target-before-pointer keeps the worse failure off the table.
    await c.env.FAVORITES.put(userId, JSON.stringify(listsRecord))
    await c.env.FEED_TOKENS.put(feedToken, JSON.stringify({ userId, listId: DEFAULT_LIST_ID }))
  }

  await c.env.USERS.put(userId, JSON.stringify(user))

  // Cross-worker handoff: when the login came from a preview build, the session
  // belongs on the staging worker's host (the prod session cookie is host-only
  // and unreadable there). Instead of setting a prod cookie, mint a short-lived
  // ticket and bounce to the staging worker, which sets its own cookie. Gated on
  // both an allowlisted origin and a configured HANDOFF_SECRET, so this branch is
  // inert in production until staging is provisioned.
  if (handoff && isAllowedHandoffOrigin(handoff, c.env) && c.env.HANDOFF_SECRET) {
    const ticket = await signHandoffTicket(
      { sub: userId, email: user.email, name: user.name, picture: user.picture },
      c.env.HANDOFF_SECRET,
    )
    const dest = new URL('/auth/handoff', handoff)
    dest.searchParams.set('ticket', ticket)
    if (returnTo) dest.searchParams.set('return_to', returnTo)

    const headers = new Headers()
    headers.set('Location', dest.toString())
    headers.append('Set-Cookie', 'oauth_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
    return new Response(null, { status: 302, headers })
  }

  // Create session JWT
  const token = await signJWT({ sub: userId }, c.env.JWT_SECRET, SESSION_MAX_AGE)

  // Redirect back to site with session cookie, clear oauth nonce
  const redirectUrl = (returnTo && isAllowedReturnUrl(returnTo)) ? returnTo : c.env.SITE_URL
  const headers = new Headers()
  headers.set('Location', redirectUrl)
  headers.append('Set-Cookie', `session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_MAX_AGE}`)
  headers.append('Set-Cookie', 'oauth_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
  return new Response(null, { status: 302, headers })
})

authRoutes.get('/me', async (c) => {
  const userId = await extractUserId(c.req.header('Cookie'), c.env.JWT_SECRET)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const userRaw = await c.env.USERS.get(userId)
  if (!userRaw) return c.json({ error: 'User not found' }, 404)

  const user = JSON.parse(userRaw) as UserRecord
  const workerUrl = new URL(c.req.url).origin
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      feedToken: user.feedToken,
      feedUrl: `${workerUrl}/feed/${user.feedToken}.ics`,
    },
  })
})

authRoutes.post('/logout', (c) => {
  return c.json({ ok: true }, 200, {
    'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0',
  })
})
