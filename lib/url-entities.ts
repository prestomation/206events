/**
 * Detection of HTML/XML character entities that have leaked into URL fields.
 *
 * Why this exists: a literal `&` is legal and common in URLs (query-string
 * separators), so `new URL("https://x.com/?a=1&amp;b=2")` does **not** throw —
 * the `&amp;` survives verbatim through `toString()` and into our ICS `URL:` /
 * `ATTACH:` lines and the discovery JSON, producing a broken link (a client
 * following it sends `amp;b=2` as a bogus parameter). Valid source HTML encodes
 * `&` inside attributes as `&amp;` per the spec, so a ripper that pulls an
 * `href` without decoding carries the entity straight through.
 *
 * The build treats an entity in any URL field as a fatal error (see
 * `collectUrlEntityErrors` callers in `lib/calendar_ripper.ts`). The fix
 * belongs at the source:
 *   - In a ripper: decode the value at extraction, e.g. `decode(href)` from
 *     `html-entities`, before assigning it to `event.url` / `event.imageUrl`.
 *   - In hand-authored YAML: write the literal character (`&`, not `&amp;`).
 *
 * See docs/url-entities.md for the full rationale.
 */

import { decode } from "html-entities";

// The known entity set we flag. We deliberately do **not** flag a bare `&`
// (legitimate query separator) — only `&` followed by a recognized entity
// token: the common named entities plus any numeric character reference
// (decimal `&#38;` or hex `&#x26;`). Matching is case-insensitive because
// `&AMP;` / `&#X26;` are also valid HTML.
const URL_ENTITY_REGEX = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi;

/**
 * Return the distinct HTML entities found in `value`, in first-seen order.
 * Empty array when there are none (the common case). Non-strings yield `[]`.
 */
export function findHtmlEntities(value: unknown): string[] {
    if (typeof value !== "string" || value.length === 0) return [];
    const matches = value.match(URL_ENTITY_REGEX);
    if (!matches) return [];
    // Lowercase for de-duplication so `&AMP;` and `&amp;` collapse, but keep a
    // single representative spelling per distinct entity.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of matches) {
        const key = m.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(m);
        }
    }
    return out;
}

/** True when `value` contains at least one known HTML entity. */
export function containsHtmlEntity(value: unknown): boolean {
    return findHtmlEntities(value).length > 0;
}

/**
 * Decode HTML entities in a URL string (`&amp;` → `&`, `&#38;` → `&`, …).
 * Used defensively at the output boundary so a stray entity never ships as a
 * broken link even though the build also fails on it. Returns the input
 * unchanged when there is nothing to decode.
 */
export function decodeUrlEntities(value: string): string {
    return containsHtmlEntity(value) ? decode(value) : value;
}

/** Scope of a URL field, used only for human-readable error attribution. */
export type UrlEntityScope = "ripper" | "external" | "recurring" | "event";

export interface UrlEntityError {
    scope: UrlEntityScope;
    source: string;            // ripper/external/recurring source name
    calendar?: string;         // calendar name when applicable
    field: string;             // e.g. "url", "friendlyLink", "icsUrl", "event.url"
    value: string;             // the offending raw value
    entities: string[];        // the distinct entities detected, e.g. ["&amp;"]
}

/**
 * Check a single URL field. Returns a `UrlEntityError` when `value` is a
 * non-empty string containing a known entity, otherwise `null`. Pure and
 * trivially unit-testable; the build iterates configs/events and collects the
 * non-null results.
 */
export function checkUrlField(
    scope: UrlEntityScope,
    source: string,
    calendar: string | undefined,
    field: string,
    value: unknown,
): UrlEntityError | null {
    if (typeof value !== "string" || value.length === 0) return null;
    const entities = findHtmlEntities(value);
    if (entities.length === 0) return null;
    return { scope, source, calendar, field, value, entities };
}

/** Format a `UrlEntityError` into a one-line, actionable message. */
export function formatUrlEntityError(e: UrlEntityError): string {
    const where = e.calendar ? `${e.source} / ${e.calendar}` : e.source;
    return (
        `URL entity ${e.entities.join(", ")} in ${e.scope} "${where}" field ${e.field}: ${e.value} — ` +
        `decode it in the ripper (html-entities) or write the literal character in YAML.`
    );
}
