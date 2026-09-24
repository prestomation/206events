/**
 * Shared helpers for extracting an admission price from freeform page text.
 * Used by the Squarespace body-text extraction, the Pantry class-page
 * scraper, and the West Seattle Chamber Fees/Admission field parser — all
 * three scan HTML/plain text for dollar amounts and free-admission phrasing,
 * and need to skip a member/child/senior-tiered price in favor of the
 * general-admission one the pricing rubric calls for.
 */

// A discount-tier word immediately before a matched price label (e.g.
// "Member price: $15") means this is not the general-admission price the
// rubric calls for — the caller should skip it and look for the next match
// on the page instead (e.g. a later "Regular price: $25"). The leading `\b`
// matters: without it "member" also matches inside "Nonmember", which is
// itself a general-admission label, not a discount tier.
const TIER_PREFIX_RE = /\b(?:member|student|senior|child|kids?|youth|volunteer)\s+$/i;

/**
 * Runs `priceRe` (must have the `g` flag) against `text` and returns the
 * first captured dollar amount whose immediately-preceding text does not end
 * in a discount-tier word. Resets `priceRe.lastIndex` before scanning, so
 * the same compiled regex can be reused across calls.
 */
export function firstNonTieredPrice(text: string, priceRe: RegExp): string | undefined {
    priceRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = priceRe.exec(text))) {
        const prefix = text.slice(Math.max(0, m.index - 40), m.index);
        if (TIER_PREFIX_RE.test(prefix)) continue;
        return m[1];
    }
    return undefined;
}

/** Parses a possibly comma-grouped dollar-amount capture (e.g. "1,250") into a number. */
export function parseDollars(s: string): number {
    return parseFloat(s.replace(/,/g, ""));
}

// "Not [a] free ..." / "no longer free" / "isn't free" negates an
// otherwise-matching free phrase immediately after it.
const LOCAL_NEGATION_RE = /\bnot\s+(?:a\s+|an\s+)?(?:really\s+)?$|\bno longer\s*$|\bisn.t\s*$/i;

/**
 * Tests whether `freeSignalRe` (must have the `g` flag) matches `text`
 * anywhere that isn't immediately preceded by a negation. Checked locally
 * around each match — not across the whole text — so an unrelated negated
 * idiom elsewhere (e.g. "not a free-for-all") can't suppress a genuine,
 * separate free-admission phrase later in the same text. Resets
 * `freeSignalRe.lastIndex` before scanning.
 */
export function hasUnnegatedMatch(text: string, freeSignalRe: RegExp): boolean {
    freeSignalRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = freeSignalRe.exec(text))) {
        const prefix = text.slice(Math.max(0, m.index - 20), m.index);
        if (!LOCAL_NEGATION_RE.test(prefix)) return true;
    }
    return false;
}
