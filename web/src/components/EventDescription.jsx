import { CONTAINS_HTML, sanitizeHtml } from '../utils/html.js'

// Matches bare http(s):// and www. URLs in plain text. Stops at whitespace or
// an angle bracket (either direction) so it never swallows surrounding markup.
const URL_RE = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi
// Trailing punctuation that's almost always sentence punctuation, not URL.
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/

// Turn a plain-text string into an array of strings and <a> nodes, making bare
// URLs clickable. Returns React children (no HTML injection — segments are
// plain strings and anchors are real elements).
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
    out.push(
      <a key={start} href={href} target="_blank" rel="noopener noreferrer">{url}</a>
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
