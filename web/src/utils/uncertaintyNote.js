// Client mirror of lib/uncertainty-merge.ts `stripUncertaintyNote`.
//
// The backend appends a plain-text caveat to event descriptions for ICS/RSS
// subscribers — e.g. "\n\n⚠️ Duration could not be verified against the
// source.\nSource: …". The web UI surfaces that as a structured inline badge
// (event.uncertainty) instead, so any description we render should have the
// note removed. The events-index description is already stripped server-side
// (gated on event.uncertainty), but the channel/venue page parses the raw ICS
// (which keeps the note), so ParsedEventRow strips it there — gated on the
// joined index event's `uncertainty` so a note-less description is never
// touched.
//
// Matching is on our own deterministic marker ("\n\n⚠️ "), not fragile parsing
// of third-party prose. `lastIndexOf` ensures only our trailing note (always
// appended last) is removed even if the description has an earlier "⚠️" block.
// A description with no appended note is returned as-is.
export function stripUncertaintyNote(text) {
  if (!text) return text
  const marker = text.lastIndexOf('\n\n⚠️ ')
  if (marker === -1) {
    // Note-only description (no preceding text).
    if (text.startsWith('⚠️ ')) return ''
    return text
  }
  return text.slice(0, marker)
}
