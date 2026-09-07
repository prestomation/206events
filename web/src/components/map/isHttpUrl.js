// Only ever emit http(s) URLs -- guards against javascript:/data: URLs reaching
// an href or an <img src> from source data. React escapes text by default, so
// there is no manual HTML escaping to do; this is about the schemes.
export function isHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u)
}
