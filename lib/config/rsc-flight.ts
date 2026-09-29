/**
 * Shared helpers for scraping event data out of PublicDisplay.ART-family
 * sites (publicdisplay.art itself, and per-org sites built on the same
 * Next.js stack). Their pages embed data as a Next.js React Server
 * Components ("RSC") flight payload rather than a conventional API or
 * DOM-rendered listing — see sources/art_love_salon/ripper.ts for the
 * original writeup of this pattern. Promoted here once a second ripper
 * (sources/occidental_fine_arts_center) needed the same extraction and
 * free-text hours parsing.
 */

/**
 * Concatenates every `self.__next_f.push([1,"..."])` chunk on the page into
 * one string. Next.js streams RSC payload text across many script tags in
 * document order; each chunk's payload is a JS string literal (JSON-escaped
 * closely enough that `JSON.parse` of a re-quoted chunk reliably unescapes
 * it) that must be concatenated before any embedded JSON can be located.
 */
export function extractNextFlightData(html: string): string {
    const chunkRegex = /__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
    let full = '';
    let match: RegExpExecArray | null;
    while ((match = chunkRegex.exec(html)) !== null) {
        full += JSON.parse(`"${match[1]}"`);
    }
    return full;
}

/**
 * Finds `marker` (e.g. `"initialEvents":[`) in `full` and returns the
 * balanced-bracket JSON substring starting at the marker's own open
 * bracket/brace, ignoring brackets inside quoted strings. The RSC payload
 * has no stable overall structure to parse (it's a mix of React element
 * trees and raw data), so this locates just the one embedded JSON value we
 * need rather than attempting to parse the whole payload.
 */
export function extractJsonAfterMarker(full: string, marker: string, open: string, close: string): string | undefined {
    const markerIndex = full.indexOf(marker);
    if (markerIndex === -1) return undefined;
    const start = markerIndex + marker.length - 1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < full.length; i++) {
        const c = full[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') inString = false;
            continue;
        }
        if (c === '"') inString = true;
        else if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) { end = i + 1; break; }
        }
    }
    if (end === -1) return undefined;
    return full.slice(start, end);
}

export function to24Hour(hourStr: string, ampm: string): number {
    const hour = parseInt(hourStr, 10) % 12;
    return ampm.toUpperCase() === 'PM' ? hour + 12 : hour;
}

export interface ParsedHoursRange {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
}

/**
 * Parses a PublicDisplay.ART-family `hours` field's free-text time range
 * into 24-hour start/end components. Handles two shapes seen on event
 * pages:
 *   - Full: "12:00 PM - 1:00 PM" — each side carries its own AM/PM.
 *   - Compact: "5-9pm" / "5:30-9pm" — a single shared AM/PM covers
 *     both sides, and minutes are optional on either side. This is
 *     the plain-English shorthand organizers type directly into the
 *     platform's admin (as opposed to the fuller format the platform's
 *     own UI generates), so both need support.
 * Returns null when neither shape matches.
 */
export function parseHoursRange(hours: string): ParsedHoursRange | null {
    const fullMatch = hours.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (fullMatch) {
        return {
            startHour: to24Hour(fullMatch[1], fullMatch[3]),
            startMinute: parseInt(fullMatch[2], 10),
            endHour: to24Hour(fullMatch[4], fullMatch[6]),
            endMinute: parseInt(fullMatch[5], 10),
        };
    }

    // Compact range with one shared AM/PM at the end, e.g. "5-9pm" or
    // "5:30-9pm". Applies that single meridiem to both sides first —
    // correct for the common case (an evening slot like "5-9pm"). A
    // range that actually crosses noon (e.g. "9-5pm" meaning 9 AM to
    // 5 PM, or "11-2pm" meaning 11 AM to 2 PM) would invert under that
    // assumption (start > end); when it does, the start must be the
    // other meridiem instead — mirrors the equivalent inference
    // sources/cobys_cafe/ripper.ts's parser applies for its analogous
    // shorthand. Left unanchored, like the full-format regex above, so a
    // stray trailing period or surrounding text doesn't itself defeat
    // the match.
    const compactMatch = hours.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (compactMatch) {
        const ampm = compactMatch[5];
        const endHour = to24Hour(compactMatch[3], ampm);
        let startHour = to24Hour(compactMatch[1], ampm);
        if (startHour > endHour) {
            startHour = to24Hour(compactMatch[1], ampm.toUpperCase() === 'PM' ? 'AM' : 'PM');
        }
        if (startHour <= endHour) {
            return {
                startHour,
                startMinute: compactMatch[2] ? parseInt(compactMatch[2], 10) : 0,
                endHour,
                endMinute: compactMatch[4] ? parseInt(compactMatch[4], 10) : 0,
            };
        }
    }

    return null;
}
