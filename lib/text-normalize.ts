import { decode } from "html-entities";

/**
 * Decode HTML entities in short display text — event titles (`summary`) and,
 * via `lib/geocoder.ts`'s `normalizeLocation()`, event/venue location strings.
 * Sources frequently emit text like `"Greg Hoy &amp; the Boys"` or
 * `"39th Ave SW &amp; SW Orchard St"`; left raw, the `&amp;` renders literally
 * in calendar apps (ICS), `events-index.json`, RSS, the website, and defeats
 * Nominatim geocoding. Decoding once, centrally, fixes every consumer.
 *
 * Idempotent and safe to apply over text a ripper already decoded:
 * `html-entities`' `decode` only converts recognized entity tokens, so a bare
 * `&` ("AT&T", "Q&A") and already-decoded text pass through untouched. The one
 * case a second pass changes anything is genuinely double-encoded source
 * (`&amp;amp;` → `&amp;` → `&`), where the extra decode is exactly what's wanted.
 *
 * Scope is deliberately limited to titles and locations — both short,
 * plain-text fields. Descriptions are left as-is: they are sometimes
 * intentional HTML rendered through the sanitizer (`web/src/utils/html.js`),
 * so blanket-decoding them could corrupt markup.
 */
export function decodeEntities(text: string): string {
    if (typeof text !== "string" || text.length === 0) return text;
    return decode(text);
}
