import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

async function makeAuthCookie(userId = 'user:google:123') {
  const token = await signJWT({ sub: userId }, JWT_SECRET, 3600)
  return `session=${token}`
}

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    USERS: createMockKV(),
    FAVORITES: createMockKV(),
    FEED_TOKENS: createMockKV(),
    RATE_LIMIT: createMockKV(),
    JWT_SECRET,
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    GITHUB_PAGES_BASE_URL: 'https://206.events',
    SITE_URL: 'https://206.events',
    FEEDBACK_GITHUB_ISSUES_TOKEN: 'gh-test-token',
    GITHUB_REPO: 'prestomation/206events',
    ...overrides,
  }
}

// Capture the last GitHub issue-create call so tests can assert on it.
function mockGitHub(ok = true) {
  const calls: { url: string; init: RequestInit; payload: any }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const payload = init?.body ? JSON.parse(init.body as string) : null
    calls.push({ url: String(url), init: init || {}, payload })
    return new Response(JSON.stringify({ html_url: 'https://github.com/prestomation/206events/issues/1' }), {
      status: ok ? 201 : 500,
    })
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

function post(body: unknown, headers: Record<string, string> = {}, env = createEnv()) {
  return app.request('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, env)
}

describe('Feedback API', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a GitHub issue for a valid general submission', async () => {
    const { calls } = mockGitHub()
    const res = await post({ type: 'general', message: 'Love the site, thanks!' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.github.com/repos/prestomation/206events/issues')
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer gh-test-token' })
    expect(calls[0].payload.title).toContain('[Feedback]')
    expect(calls[0].payload.labels).toEqual(['feedback'])
    expect(calls[0].payload.body).toContain('Love the site')
    expect(calls[0].payload.body).toContain('anonymous')
  })

  it('uses bug labels/title and includes context for a source report', async () => {
    const { calls } = mockGitHub()
    const res = await post({
      type: 'bug',
      message: 'Events are missing here',
      context: { sourceName: 'Stoup Brewing', icsUrl: 'stoup.ics', pageUrl: 'https://206.events/#x' },
    })
    expect(res.status).toBe(200)
    expect(calls[0].payload.title).toContain('[Bug]')
    expect(calls[0].payload.title).toContain('Stoup Brewing')
    expect(calls[0].payload.labels).toEqual(['feedback', 'bug'])
    expect(calls[0].payload.body).toContain('Stoup Brewing')
    expect(calls[0].payload.body).toContain('stoup.ics')
  })

  it('uses new-source label for a source request', async () => {
    const { calls } = mockGitHub()
    await post({ type: 'source', message: 'Please add the Tractor Tavern' })
    expect(calls[0].payload.title).toContain('[Source request]')
    expect(calls[0].payload.labels).toEqual(['feedback', 'new-source'])
  })

  it('silently drops bots that fill the honeypot (no GitHub call)', async () => {
    const { calls } = mockGitHub()
    const res = await post({ type: 'general', message: 'buy cheap stuff', website: 'http://spam.example' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls).toHaveLength(0)
  })

  it('rejects an invalid type', async () => {
    const { calls } = mockGitHub()
    const res = await post({ type: 'nonsense', message: 'hi' })
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('rejects an empty message', async () => {
    mockGitHub()
    const res = await post({ type: 'general', message: '   ' })
    expect(res.status).toBe(400)
  })

  it('rejects an over-long message', async () => {
    mockGitHub()
    const res = await post({ type: 'general', message: 'x'.repeat(5001) })
    expect(res.status).toBe(400)
  })

  it('rejects a malformed email', async () => {
    mockGitHub()
    const res = await post({ type: 'general', message: 'hi', email: 'not-an-email' })
    expect(res.status).toBe(400)
  })

  it('rejects an email carrying markdown link syntax', async () => {
    const { calls } = mockGitHub()
    // Would render as a clickable link in the public issue if accepted.
    const res = await post({ type: 'general', message: 'hi', email: '[x](http://evil)@a.com' })
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('neutralizes markdown link syntax in metadata fields', async () => {
    const { calls } = mockGitHub()
    await post({ type: 'bug', message: 'see source', context: { sourceName: '[click](http://evil)' } })
    const body = calls[0].payload.body as string
    // The "](" link bridge must be broken so no clickable link is produced.
    expect(body).not.toContain('](http://evil)')
  })

  it('returns 503 when GITHUB_REPO is malformed', async () => {
    mockGitHub()
    const env = createEnv({ GITHUB_REPO: '../../evil' })
    const res = await post({ type: 'general', message: 'hi' }, {}, env)
    expect(res.status).toBe(503)
  })

  it('includes only the opt-in body email, never the session email', async () => {
    const { calls } = mockGitHub()
    const env = createEnv()
    // Even with a signed-in session, the account email must not leak into the
    // public issue — only the explicitly-typed email is included.
    await env.USERS.put('user:google:123', JSON.stringify({ email: 'real@user.com', name: 'Real' }))
    const cookie = await makeAuthCookie()
    const res = await post({ type: 'general', message: 'hello', email: 'typed@thing.com' }, { Cookie: cookie }, env)
    expect(res.status).toBe(200)
    expect(calls[0].payload.body).toContain('typed@thing.com')
    expect(calls[0].payload.body).not.toContain('real@user.com')
    expect(calls[0].payload.body).toContain('**Account:** signed-in')
  })

  it('marks anonymous submissions as not signed in', async () => {
    const { calls } = mockGitHub()
    await post({ type: 'general', message: 'hi there' })
    expect(calls[0].payload.body).toContain('**Account:** not signed in')
  })

  it('wraps the free-text message in a code fence (mention-safe)', async () => {
    const { calls } = mockGitHub()
    await post({ type: 'general', message: 'ping @everyone and closes #1' })
    const body = calls[0].payload.body as string
    // GitHub does not parse @mentions / #refs inside a fenced code block, so the
    // message is rendered verbatim there rather than character-mangled.
    expect(body).toContain('```text\nping @everyone and closes #1\n```')
  })

  it('escapes a code fence embedded in the message', async () => {
    const { calls } = mockGitHub()
    await post({ type: 'general', message: 'breakout ```\n# heading\n``` end' })
    const body = calls[0].payload.body as string
    // The injected fence must be neutralized so it can't escape our block.
    expect(body).not.toContain('breakout ```\n')
  })

  it('neutralizes markdown mentions in metadata fields', async () => {
    const { calls } = mockGitHub()
    await post({ type: 'bug', message: 'see source', context: { sourceName: '@everyone team' } })
    const body = calls[0].payload.body as string
    // Context fields render as plain markdown lines, so an @ after a space would
    // become a live mention — it must be neutralized.
    expect(body).not.toContain('@everyone')
  })

  it('enforces the per-IP rate limit', async () => {
    const { calls } = mockGitHub()
    const env = createEnv()
    const headers = { 'CF-Connecting-IP': '203.0.113.7' }
    for (let i = 0; i < 5; i++) {
      const ok = await post({ type: 'general', message: `msg ${i}` }, headers, env)
      expect(ok.status).toBe(200)
    }
    const blocked = await post({ type: 'general', message: 'one too many' }, headers, env)
    expect(blocked.status).toBe(429)
    expect(calls).toHaveLength(5)
  })

  it('returns 503 when feedback is not configured', async () => {
    mockGitHub()
    const env = createEnv({ FEEDBACK_GITHUB_ISSUES_TOKEN: undefined, GITHUB_REPO: undefined })
    const res = await post({ type: 'general', message: 'hi' }, {}, env)
    expect(res.status).toBe(503)
  })

  it('returns 502 when GitHub rejects the issue', async () => {
    mockGitHub(false)
    const res = await post({ type: 'general', message: 'hi' })
    expect(res.status).toBe(502)
  })
})
