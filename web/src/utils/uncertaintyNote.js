// Client mirror of lib/uncertainty-merge.ts `stripUncertaintyNote`.
//
// The backend appends a plain-text caveat to event descriptions for ICS/RSS
// subscribers — e.g. "\n\n⚠️ Duration could not be verified against the
// source.\nSource: …". The web UI surfaces that as a structured inline badge
// (event.uncertainty) instead, so any description we render should have the
// note removed. The events-index description is already stripped server-side,
// but the channel/venue page parses the raw ICS (which keeps the note), so we
// strip again at the render choke point (EventDescription).
//
// Matching is on our own deterministic marker ("\n\n⚠️ "), not fragile parsing
// of third-party prose. A description with no appended note is returned as-is.
export function stripUncertaintyNote(text) {
  if (!text) return text
  const marker = text.indexOf('\n\n⚠️ ')
  if (marker === -1) {
    // Note-only description (no preceding text).
    if (text.startsWith('⚠️ ')) return ''
    return text
  }
  return text.slice(0, marker)
}
