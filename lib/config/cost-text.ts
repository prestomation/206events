/**
 * Shared helpers for extracting an admission price from freeform page text
 * (used by the Squarespace body-text extraction and the Pantry class-page
 * scraper — both scan HTML/plain text for a "Price: $NNN"-style label and
 * need to skip a member/child/senior-tiered price in favor of the
 * general-admission one the pricing rubric calls for).
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
