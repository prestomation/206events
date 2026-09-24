/**
 * Shared helpers for extracting an admission price from freeform page text.
 * Used by the Squarespace body-text extraction, the Pantry class-page
 * scraper, and the West Seattle Chamber Fees/Admission field parser — all
 * three scan HTML/plain text for dollar amounts and free-admission phrasing,
 * and need to skip a member/child/senior-tiered price in favor of the
 * general-admission one the pricing rubric calls for.
 */

// Single source of truth for every discount-tier regex below (and reused by
// sources/west_seattle_chamber/ripper.ts) — the pricing rubric excludes all
// of these from the general-admission price it wants.
export const TIER_WORDS = "members?|student|senior|child|kids?|youth|volunteer";

// A discount-tier word immediately before a matched price label (e.g.
// "Member price: $15") means this is not the general-admission price the
// rubric calls for — the caller should skip it and look for the next match
// on the page instead (e.g. a later "Regular price: $25"). The leading `\b`
// matters: without it "member" also matches inside "Nonmember", which is
// itself a general-admission label, not a discount tier.
const TIER_PREFIX_RE = new RegExp(`\\b(?:${TIER_WORDS})\\s+$`, "i");

/**
 * Runs `priceRe` (must have the `g` flag) against `text` and returns the
 * first captured dollar amount whose immediately-preceding text does not end
 * in a discount-tier word. Resets `priceRe.lastIndex` before scanning, so
 * the same compiled regex can be reused across calls.
 */
export function firstNonTieredPrice(text: string, priceRe: RegExp): string | undefined {
    const m = firstNonTieredMatch(text, priceRe);
    return m ? m[1] : undefined;
}

/** True when `text` immediately before `index` ends in a discount-tier word. */
export function isTierPrefixed(text: string, index: number): boolean {
    const prefix = text.slice(Math.max(0, index - 40), index);
    return TIER_PREFIX_RE.test(prefix);
}

// Requires the tier word to be close to — within 15 chars of — the price
// immediately being checked, and anchored at the *end* of the lookback
// window (immediately before the price, not just somewhere within it).
// Needed when the match itself doesn't start with the price keyword (e.g. a
// bare `$15-$20` range, where "Member" and "price" are two separate words
// both ahead of the dollar sign) — the anchored TIER_PREFIX_RE only catches
// a tier word directly adjacent to what it's given, which is enough when
// the caller's regex match starts at the keyword (as KEYWORD_PRICE_RE and
// the Pantry "Price:" pattern do) but not when it starts at the "$" itself.
// No colon is required — "Member price $15-$20" (no punctuation) and
// "Member price: $15-$20" both label the same way — the tight 15-char
// budget alone is what keeps an unrelated, more-distant mention (e.g. "kids
// welcome! Admission: $10-$20", 19+ chars from "kids" to the price) from
// matching. The end-anchor is what keeps an unrelated EARLIER label still
// inside the wider lookback window (e.g. "Member price: $15-$20, Regular
// price: $25-$35" — when checking the second, correctly general-admission
// range, "Member" is far more than 15 chars back) from bleeding through.
const TIER_LABEL_RE = new RegExp(`\\b(?:${TIER_WORDS})\\b[^.$]{0,15}$`, "i");

/** True when a short window immediately before `index` ends in a discount-tier word (optionally followed by a short label like "price"), not just mentioned incidentally further back. */
export function isNearTierWord(text: string, index: number, window = 40): boolean {
    return TIER_LABEL_RE.test(text.slice(Math.max(0, index - window), index));
}

/**
 * Same scan as firstNonTieredPrice, but returns the full match (so a caller
 * needing more than one capture group — e.g. a price *range*'s min and max —
 * can use it too), and accepts an optional extra `accept` predicate a match
 * must also satisfy (e.g. "has a price-related word nearby"). Resets
 * `re.lastIndex` before scanning.
 */
export function firstNonTieredMatch(
    text: string, re: RegExp, accept: (m: RegExpExecArray) => boolean = () => true,
): RegExpExecArray | undefined {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (isTierPrefixed(text, m.index) || !accept(m)) continue;
        return m;
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
