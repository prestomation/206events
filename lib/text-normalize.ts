import { decode } from "html-entities";

/**
 * Decode HTML entities in short display text — currently event titles
 * (`summary`). Sources frequently emit titles like `"Greg Hoy &amp; the Boys"`
 * or `"Tom &#38; Jerry"`; left raw, the `&amp;` renders literally in calendar
 * apps (ICS), `events-index.json`, RSS, and the website (React text nodes show
 * entities verbatim). Decoding once, centrally, fixes every consumer.
 *
 * Idempotent and safe to apply over titles a ripper already decoded:
 * `html-entities`' `decode` only converts recognized entity tokens, so a bare
 * `&` ("AT&T", "Q&A") and already-decoded text pass through untouched. The one
 * case a second pass changes anything is genuinely double-encoded source
 * (`&amp;amp;` → `&amp;` → `&`), where the extra decode is exactly what's wanted.
 *
 * Scope is deliberately limited to titles. Descriptions are left as-is: they
 * are sometimes intentional HTML rendered through the sanitizer
 * (`web/src/utils/html.js`), so blanket-decoding them could corrupt markup.
 */
export function decodeEntities(text: string): string {
    if (typeof text !== "string" || text.length === 0) return text;
    return decode(text);
}
