// Splits CamelCase / PascalCase tag names into spaced labels for display.
// e.g. "QueenAnne" -> "Queen Anne", "FarmersMarket" -> "Farmers Market".
export function formatTagLabel(tag) {
  return tag
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}
