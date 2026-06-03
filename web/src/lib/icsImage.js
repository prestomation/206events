// Pull an image URL out of a parsed ICAL.js VEVENT. Prefers RFC 7986 `IMAGE`
// (VALUE=URI); falls back to an `ATTACH` whose FMTTYPE is an image type or whose
// URL looks like an image. Returns a link only — never embedded data. Mirrors
// extractImageUrl() in lib/tag_aggregator.ts so the web UI and the build agree.
export function extractIcsImageUrl(vevent) {
  if (!vevent) return undefined
  const image = vevent.getFirstPropertyValue('image')?.toString()
  if (image && /^https?:\/\//i.test(image)) return image

  const attach = vevent.getFirstProperty('attach')
  if (attach) {
    const value = attach.getFirstValue()?.toString()
    if (value && /^https?:\/\//i.test(value)) {
      const fmttype = (attach.getParameter('fmttype') || '').toString().toLowerCase()
      if (fmttype.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(value)) {
        return value
      }
    }
  }
  return undefined
}
