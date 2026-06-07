import { Hono } from 'hono'
import type { Context } from 'hono'
import type { Env } from './types.js'
import { extractUserId } from './auth-middleware.js'

// Free-text + field caps. Generous enough for real feedback, tight enough to
// keep a single GitHub issue body sane and bound abuse.
const MAX_MESSAGE_LENGTH = 5000
const MAX_EMAIL_LENGTH = 200
const MAX_CONTEXT_FIELD_LENGTH = 500

// Per-IP rate limit: at most this many submissions inside the window. Stored as
// a counter in the RATE_LIMIT KV namespace with a matching expirationTtl.
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60 // 1 hour

const FEEDBACK_TYPES = ['general', 'bug', 'source'] as const
type FeedbackType = (typeof FEEDBACK_TYPES)[number]

interface FeedbackContext {
  sourceName?: string
  icsUrl?: string
  pageUrl?: string
}

interface FeedbackBody {
  type?: unknown
  message?: unknown
  email?: unknown
  context?: unknown
  website?: unknown // honeypot — real users never see or fill this
}

// Per-type presentation: issue title prefix + labels. `feedback` is always
// applied so every submission is filterable in one query.
const TYPE_META: Record<FeedbackType, { titlePrefix: string; labels: string[] }> = {
  general: { titlePrefix: '[Feedback]', labels: ['feedback'] },
  bug: { titlePrefix: '[Bug]', labels: ['feedback', 'bug'] },
  source: { titlePrefix: '[Source request]', labels: ['feedback', 'new-source'] },
}

function isFeedbackType(v: unknown): v is FeedbackType {
  return typeof v === 'string' && (FEEDBACK_TYPES as readonly string[]).includes(v)
}

// Email shape check. We never *require* an email, so this only validates
// non-empty values. The charset is deliberately restrictive (no markdown-
// significant characters like [ ] ( ) * ` ) so an opt-in email can't smuggle a
// clickable link / mention into the public issue, e.g. "[x](http://evil)@a.com".
function isPlausibleEmail(v: string): boolean {
  return v.length <= MAX_EMAIL_LENGTH && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)
}

// Neutralize GitHub-flavored markdown that would let untrusted feedback mass-
// mention users (`@org/team`, `@user`), cross-link/auto-close issues (`#123`,
// `closes #123`), or inject clickable links (`[text](url)`). Used on short
// interpolated fields (titles, context values) — the free-text message is
// instead wrapped in a code fence. Inserting a zero-width space after the sigil
// keeps the text readable while breaking the autolink/mention/link parser.
function neutralizeMarkdown(s: string): string {
  return s.replace(/[@#[\]]/g, (ch) => `${ch}​`)
}

// Single-line, length-capped value safe to drop into an issue title.
function sanitizeTitlePart(s: string): string {
  return neutralizeMarkdown(s.replace(/\s+/g, ' ').trim()).slice(0, 80)
}

function sanitizeContextField(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, MAX_CONTEXT_FIELD_LENGTH)
}

// Whether the request carries a valid signed-in session. Used only as a
// non-identifying trust signal in the issue body — we deliberately do NOT read
// or post the user's email, since the issue is public and the email field is
// strictly opt-in. Non-fatal: any failure is treated as anonymous.
async function isAuthenticatedSession(c: Context<{ Bindings: Env }>): Promise<boolean> {
  try {
    const userId = await extractUserId(c.req.header('Cookie'), c.env.JWT_SECRET)
    return !!userId
  } catch {
    return false
  }
}

// Returns true when the request is within the per-IP budget (and records it),
// false when the budget is exhausted. Fails open if the KV binding is absent so
// a misconfiguration never silently swallows all feedback.
async function withinRateLimit(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const kv = c.env.RATE_LIMIT
  if (!kv) return true
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  const key = `rl:feedback:${ip}`
  const current = parseInt((await kv.get(key)) || '0', 10) || 0
  if (current >= RATE_LIMIT_MAX) return false
  await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS })
  return true
}

// Build the GitHub issue body. The user's free-text message goes inside a fenced
// code block so it can't inject markdown / mentions; short metadata fields are
// individually neutralized.
function buildIssueBody(args: {
  type: FeedbackType
  message: string
  email: string | null
  authenticated: boolean
  context: FeedbackContext
  submittedAt: string
}): string {
  const { type, message, email, authenticated, context, submittedAt } = args
  const lines: string[] = []
  lines.push(`**Type:** ${type}`)
  // Email is opt-in only and format-validated (single `@`, no spaces) with the
  // `@` preceded by the local-part, so GitHub won't parse it as a mention.
  lines.push(`**From:** ${email || 'anonymous'}`)
  lines.push(`**Account:** ${authenticated ? 'signed-in' : 'not signed in'}`)
  if (context.sourceName) lines.push(`**Source:** ${neutralizeMarkdown(context.sourceName)}`)
  if (context.icsUrl) lines.push(`**Calendar feed:** ${neutralizeMarkdown(context.icsUrl)}`)
  if (context.pageUrl) lines.push(`**Page:** ${neutralizeMarkdown(context.pageUrl)}`)
  lines.push(`**Submitted:** ${submittedAt}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  // Escape any fence inside the message so it can't break out of the block.
  lines.push('```text')
  lines.push(message.replace(/```/g, "'''"))
  lines.push('```')
  lines.push('')
  lines.push('_Submitted via the in-app feedback form on 206.events._')
  return lines.join('\n')
}

// Operator-set config, not user input, but validate the shape anyway so a
// typo'd GITHUB_REPO can never bend the GitHub API URL into an unexpected path.
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export async function handlePostFeedback(c: Context<{ Bindings: Env }>) {
  if (!c.env.FEEDBACK_GITHUB_ISSUES_TOKEN || !c.env.GITHUB_REPO || !REPO_PATTERN.test(c.env.GITHUB_REPO)) {
    return c.json({ error: 'Feedback is not configured' }, 503)
  }

  let body: FeedbackBody
  try {
    body = (await c.req.json()) as FeedbackBody
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // Honeypot: a filled `website` field means a bot. Acknowledge success so the
  // bot sees no signal, but create nothing.
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return c.json({ ok: true }, 200)
  }

  if (!isFeedbackType(body.type)) {
    return c.json({ error: 'Invalid feedback type' }, 400)
  }
  const type = body.type

  if (typeof body.message !== 'string') {
    return c.json({ error: 'message is required' }, 400)
  }
  const message = body.message.trim()
  if (!message) {
    return c.json({ error: 'message is required' }, 400)
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return c.json({ error: `message too long (max ${MAX_MESSAGE_LENGTH} chars)` }, 400)
  }

  // Email is strictly opt-in (the issue is public). We take it only from the
  // body, never from the session, so a signed-in user's address is never posted
  // unless they explicitly typed/kept it in the form.
  let email: string | null = null
  if (typeof body.email === 'string' && body.email.trim()) {
    const candidate = body.email.trim()
    if (!isPlausibleEmail(candidate)) {
      return c.json({ error: 'Invalid email' }, 400)
    }
    email = candidate
  }
  const authenticated = await isAuthenticatedSession(c)

  const rawContext = (body.context && typeof body.context === 'object' ? body.context : {}) as Record<string, unknown>
  const context: FeedbackContext = {
    sourceName: sanitizeContextField(rawContext.sourceName),
    icsUrl: sanitizeContextField(rawContext.icsUrl),
    pageUrl: sanitizeContextField(rawContext.pageUrl),
  }

  if (!(await withinRateLimit(c))) {
    return c.json({ error: 'Too many submissions, please try again later' }, 429)
  }

  const meta = TYPE_META[type]
  const titleHint = sanitizeTitlePart(context.sourceName || message)
  const title = `${meta.titlePrefix} ${titleHint || 'New submission'}`
  const submittedAt = new Date().toISOString()
  const issueBody = buildIssueBody({ type, message, email, authenticated, context, submittedAt })

  let ghRes: Response
  try {
    ghRes = await fetch(`https://api.github.com/repos/${c.env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.FEEDBACK_GITHUB_ISSUES_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': '206events-feedback',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body: issueBody, labels: meta.labels }),
    })
  } catch {
    return c.json({ error: 'Failed to submit feedback' }, 502)
  }

  if (!ghRes.ok) {
    return c.json({ error: 'Failed to submit feedback' }, 502)
  }

  // Deliberately do not echo the created issue URL back to anonymous callers.
  return c.json({ ok: true }, 200)
}

export const feedbackRoutes = new Hono<{ Bindings: Env }>()
feedbackRoutes.post('/', handlePostFeedback)
