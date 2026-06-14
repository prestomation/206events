import { CONTAINS_HTML, sanitizeHtml } from '../utils/html.js'

// Matches bare http(s):// and www. URLs in plain text. Stops at whitespace or
// an angle bracket (either direction) so it never swallows surrounding markup.
const URL_RE = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi
// Trailing punctuation that's almost always sentence punctuation, not URL.
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/

// Compact external-link glyph used in place of a bare URL's text.
const EXT_LINK_ICON = (
  <svg viewBox="0 0 24 24" width="0.9em" height="0.9em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
  </svg>
)

// Short, human-friendly host for a URL ("www.example.com/x" -> "example.com").
// Falls back to the raw href if it can't be parsed.
function hostLabel(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

// Turn a plain-text string into an array of strings and link nodes. Bare URLs
// become a compact external-link icon badge (the full URL is noise the reader
// doesn't need; the destination host lives in the title/aria-label). Returns
// React children — no HTML injection, segments are plain strings and the
// anchors are real elements.
export function linkifyText(text) {
  const out = []
  let lastIndex = 0
  let match
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    const start = match.index
    let url = match[0]
    // Peel any trailing sentence punctuation back out of the link.
    let trailing = ''
    const t = url.match(TRAILING_PUNCT)
    if (t) {
      trailing = t[0]
      url = url.slice(0, url.length - trailing.length)
    }
    if (!url) continue
    if (start > lastIndex) out.push(text.slice(lastIndex, start))
    const href = url.startsWith('www.') ? `https://${url}` : url
    const label = `Open ${hostLabel(href)}`
    out.push(
      <a key={start} href={href} target="_blank" rel="noopener noreferrer"
        className="desc-extlink" title={label} aria-label={label}
        style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', margin: '0 1px' }}>
        {EXT_LINK_ICON}
      </a>
    )
    if (trailing) out.push(trailing)
    lastIndex = start + match[0].length
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex))
  return out
}

// Renders an event description, sanitizing it when it contains HTML markup and
// linkifying bare URLs when it's plain text so links are always clickable.
export function EventDescription({ text }) {
  if (!text) return null
  if (CONTAINS_HTML.test(text)) {
    const clean = sanitizeHtml(text)
    return <div className="event-details" dangerouslySetInnerHTML={{ __html: clean }} />
  }
  return <div className="event-details">{linkifyText(text)}</div>
}
