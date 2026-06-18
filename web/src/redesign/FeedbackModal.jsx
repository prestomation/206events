// FeedbackModal — a small dialog for sending feedback, reporting a problem with
// a source, or suggesting a new source. Driven by the app context: opened via
// app.openFeedback(prefill) and closed via app.closeFeedback(). Submissions POST
// to the favorites worker's /feedback route, which files them as GitHub issues.
// When no backend is configured (local/preview), it falls back to opening the
// GitHub "new issue" page.

import { useState, useEffect } from 'react'
import { useApp206 } from './context.js'
import { Ico } from './icons.jsx'
import cityConfig from '../../../city.config.ts'

const TYPE_OPTIONS = [
  { id: 'general', label: 'General feedback' },
  { id: 'bug', label: 'Report a problem' },
  { id: 'source', label: 'Suggest a source' },
]

// Per-type issue title prefix + labels. Mirrors TYPE_META in the favorites
// worker (infra/favorites-worker/src/feedback.ts) so an issue looks the same
// whether the worker filed it via its token or the user filed it themselves
// through the GitHub-prefill fallback below. Keep the two in sync.
const TYPE_META = {
  general: { titlePrefix: '[Feedback]', labels: ['feedback'] },
  bug: { titlePrefix: '[Bug]', labels: ['feedback', 'bug'] },
  source: { titlePrefix: '[Source request]', labels: ['feedback', 'new-source'] },
}

// GitHub's new-issue GET form 414s on very long URLs. Past this length we open a
// shorter URL and copy the full body to the clipboard instead.
const MAX_ISSUE_URL_LENGTH = 6000

// Neutralize GitHub-flavored markdown in short interpolated fields (title +
// context), mirroring neutralizeMarkdown in the worker so `@user` mass-mentions,
// `#123` cross-links, and `[text](url)` links don't render in the prefilled
// issue preview. A zero-width space after the sigil keeps the text readable
// while breaking the parser. The free-text message is instead wrapped in a code
// fence (below), same as the worker.
function neutralizeMarkdown(s) {
  return s.replace(/[@#[\]]/g, (ch) => `${ch}​`)
}

function buildIssueTitle(type, message, context) {
  const hint = neutralizeMarkdown((context.sourceName || message).replace(/\s+/g, ' ').trim()).slice(0, 80)
  return `${(TYPE_META[type] || TYPE_META.general).titlePrefix} ${hint || 'New submission'}`
}

// Mirror the worker's buildIssueBody: short metadata lines (markdown-neutralized),
// then the free-text message in a fenced block (fences inside the message are
// escaped so they can't break out). The worker additionally stamps
// **Account:**/**Submitted:** and a footer — those are server-only trust signals
// the client can't honestly assert, so they're deliberately omitted here.
function buildIssueBody(type, message, email, context) {
  const lines = [`**Type:** ${type}`]
  if (email) lines.push(`**From:** ${neutralizeMarkdown(email)}`)
  if (context.sourceName) lines.push(`**Source:** ${neutralizeMarkdown(context.sourceName)}`)
  if (context.icsUrl) lines.push(`**Calendar feed:** ${neutralizeMarkdown(context.icsUrl)}`)
  if (context.pageUrl) lines.push(`**Page:** ${neutralizeMarkdown(context.pageUrl)}`)
  lines.push('', '---', '', '```text', message.replace(/```/g, "'''"), '```')
  return lines.join('\n')
}

function githubIssueUrl(title, body, labels) {
  const params = new URLSearchParams({ title, body, labels: labels.join(',') })
  return `${GITHUB_NEW_ISSUE}?${params.toString()}`
}

const PLACEHOLDERS = {
  general: 'What do you love, what’s missing, what would you change?',
  bug: 'What’s wrong? Which calendar or event, what you expected vs. what you saw, and a link if you have one.',
  source: `Which ${cityConfig.city.name}-area event source should we add? Paste the website URL and what kind of events it lists.`,
}

const GITHUB_NEW_ISSUE = `https://github.com/${cityConfig.site.repo}/issues/new`

export function FeedbackModal() {
  const app = useApp206()
  const prefill = app.feedbackPrefill
  const open = !!prefill

  const [type, setType] = useState('general')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot — humans leave this blank
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Each open resets the form to the (possibly new) prefill. Signed-in users get
  // their account email pre-filled but editable — it's only sent if they keep it.
  useEffect(() => {
    if (!prefill) return
    setType(prefill.type || 'general')
    setMessage('')
    setEmail(app.authUser?.email || '')
    setWebsite('')
    setError('')
    setSubmitting(false)
  }, [prefill, app.authUser])

  // Esc to close + lock body scroll while open (mirrors Lightbox).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') app.closeFeedback() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, app])

  if (!open) return null

  // Defense-in-depth: only forward known string-typed context fields, so a
  // malformed prefill can never send unexpected types/nested objects upstream
  // (the worker also validates these).
  const rawContext = prefill.context || {}
  const context = {}
  for (const key of ['sourceName', 'icsUrl', 'pageUrl']) {
    if (typeof rawContext[key] === 'string' && rawContext[key]) context[key] = rawContext[key]
  }

  // Hand off to GitHub's prefilled new-issue page, carrying the type, message,
  // email, and context the user already entered. Used when no feedback backend
  // is configured at all (!app.API_URL) and when a configured worker reports the
  // feedback route isn't set up (HTTP 503). The noopener,noreferrer features
  // prevent the opened tab from reaching back through window.opener.
  const handoffToGithub = (msg) => {
    const title = buildIssueTitle(type, msg, context)
    const body = buildIssueBody(type, msg, email.trim(), context)
    const { labels } = TYPE_META[type] || TYPE_META.general
    let url = githubIssueUrl(title, body, labels)
    if (url.length > MAX_ISSUE_URL_LENGTH) {
      // Too long for a reliable GET: copy the full body and open a short form.
      // The trailing ?. guards a missing clipboard API (e.g. insecure context),
      // where writeText is undefined and `.catch` would otherwise throw.
      navigator.clipboard?.writeText(body)?.catch(() => {})
      url = githubIssueUrl(title, '_Paste your copied feedback here._', labels)
      app.flash('Feedback copied — paste it into the GitHub issue')
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    app.closeFeedback()
  }

  const submit = async () => {
    const msg = message.trim()
    if (!msg) { setError('Please enter a message.'); return }

    // No backend (local/preview): hand off to GitHub's new-issue page.
    if (!app.API_URL) {
      handoffToGithub(msg)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${app.API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          message: msg,
          email: email.trim() || undefined,
          context,
          website, // honeypot
        }),
      })
      // Worker is up but the feedback route isn't configured (no GitHub token /
      // repo) — fall back to the same GitHub hand-off instead of a dead error.
      if (res.status === 503) {
        handoffToGithub(msg)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      app.flash('Thanks — feedback sent ✓')
      app.closeFeedback()
    } catch {
      setError('Sorry, something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="a-modal-backdrop" role="dialog" aria-modal="true" aria-label="Send feedback"
      onClick={app.closeFeedback}>
      <div className="a-modal" onClick={(e) => e.stopPropagation()}>
        <div className="a-modal-head">
          <div className="a-h1" style={{ fontSize: 20 }}>Send feedback</div>
          <button className="a-iconbtn" onClick={app.closeFeedback} aria-label="Close">{Ico.close}</button>
        </div>

        {/* type selector */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {TYPE_OPTIONS.map((opt) => (
            <button key={opt.id}
              className={`btn ${type === opt.id ? 'btn-blue' : 'btn-ghost'}`}
              style={{ height: 36, fontSize: 13 }}
              aria-pressed={type === opt.id}
              onClick={() => setType(opt.id)}>
              {opt.label}
            </button>
          ))}
        </div>

        {context.sourceName && (
          <div className="a-modal-context">
            About <strong>{context.sourceName}</strong>
          </div>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          autoFocus
          rows={5}
          maxLength={5000}
          placeholder={PLACEHOLDERS[type]}
          className="a-input a-modal-textarea" />

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional — only if you’d like a reply)"
          className="a-input"
          style={{ width: '100%', marginTop: 10 }} />

        {/* Honeypot: off-screen, not tabbable, hidden from AT. Bots fill it. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="a-hp" />

        {error && <div className="a-modal-error">{error}</div>}

        <div className="a-modal-actions">
          <button className="btn btn-ghost" onClick={app.closeFeedback} disabled={submitting}>Cancel</button>
          <button className="btn btn-blue" onClick={submit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>

        <p className="a-modal-note">
          Feedback is filed as a <strong>public</strong> GitHub issue, including any email you enter —
          please don’t include anything private.
        </p>
      </div>
    </div>
  )
}
