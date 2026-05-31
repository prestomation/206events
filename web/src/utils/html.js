import DOMPurify from 'dompurify'

export const CONTAINS_HTML = /<[a-z][\s\S]*?>/i

// Sanitizes user-facing HTML (event descriptions) to a safe allowlist.
export function sanitizeHtml(text) {
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ADD_ATTR: ['target'],
  })
}

// Strips tags and decodes common entities to plain text (for .ics / Google Calendar).
export function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
