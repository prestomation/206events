import { CONTAINS_HTML, sanitizeHtml } from '../utils/html.js'

// Renders an event description, sanitizing it when it contains HTML markup.
export function EventDescription({ text }) {
  if (!text) return null
  if (CONTAINS_HTML.test(text)) {
    const clean = sanitizeHtml(text)
    return <div className="event-details" dangerouslySetInnerHTML={{ __html: clean }} />
  }
  return <div className="event-details">{text}</div>
}
