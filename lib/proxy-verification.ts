/**
 * proxy-verification.ts
 *
 * Tracks the verification lifecycle of calendar sources that need a proxy to
 * be fetched at all (`proxy: "outofband"` or `proxy: "browserbase"`).
 *
 * Background — the problem this solves
 * ------------------------------------
 * A source that 403s from GitHub Actions IPs is added with `proxy: "outofband"`
 * on the belief that a residential IP can reach it. But that belief can't be
 * proven in the PR build: the out-of-band cron runner hasn't fetched it yet,
 * and once it does, the fetch might *still* fail (e.g. a SiteGround JS captcha
 * that blocks even residential IPs). Without a probationary state, that failure
 * is indistinguishable from a genuinely-broken source and reddens `main`.
 *
 * This module is the bookkeeping that makes the proxy escalation ladder
 * (`false → outofband → browserbase → disabled`) self-driving:
 *
 *   - The main build EXEMPTS never-deployed proxy sources from the fatal
 *     "new source produced 0 events" check (they can't be proven in CI), and
 *     surfaces them in a non-fatal `pendingProxyVerification` queue instead.
 *   - The out-of-band cron runner is the sole writer of the counter state. Each
 *     run it determines this run's outcome for every proxy source it can —
 *     `outofband` sources from its own residential fetch, `browserbase` sources
 *     from the published `build-errors.json` (browserbase is fetched live in
 *     CI) — and folds them in. Sources whose outcome can't be determined this
 *     run are carried forward unchanged rather than dropped.
 *   - After {@link ESCALATION_THRESHOLD} consecutive failures at a rung, the
 *     proxy-escalation skill (run by the out-of-band job) opens a PR moving the
 *     source up a rung — and when the top rung (browserbase) is exhausted,
 *     retires it (`disabled: true` + candidate doc `status: blocked`).
 *
 * The functions here are pure so the escalation/queue logic is unit-tested in
 * isolation from S3, the cron, and the browserbase API. See
 * docs/proxy-verification.md for the full design.
 */

export type ProxyRung = "outofband" | "browserbase";

/** Number of consecutive failed runs at a rung before the skill escalates. */
export const ESCALATION_THRESHOLD = 3;

export interface ProxyVerificationEntry {
    /** The ladder rung this source is currently configured at. */
    rung: ProxyRung;
    /** Consecutive failed verification runs at the current rung. Reset to 0 on
     * any success, and on a rung change (a fresh rung starts its own count). */
    consecutiveFailures: number;
    /** ISO date (YYYY-MM-DD) of the first time this source was verified. */
    firstAttempt: string;
    /** ISO date (YYYY-MM-DD) of the most recent verification attempt. */
    lastAttempt: string;
    /** Most recent failure reason, or null if the last attempt succeeded. */
    lastError: string | null;
    /** ISO date of the last successful fetch, or null if never. */
    lastSuccess: string | null;
    /** True once the source has produced ≥1 successful fetch at this rung. */
    proven: boolean;
}

export interface ProxyVerificationState {
    version: 1;
    /** Keyed by source `name` (ripper name or external calendar name). */
    entries: Record<string, ProxyVerificationEntry>;
}

/** One source's outcome for a single verification run. */
export interface ProxyRunOutcome {
    /** Source name (ripper name or external calendar name). */
    name: string;
    /** The rung the source is configured at right now. */
    rung: ProxyRung;
    /** True if the proxied fetch reached the source this run (HTTP 200 / no
     * block). Event *count* is deliberately NOT part of success: a 200 with 0
     * events is an `expectEmpty` concern, not a proxy-reachability problem. */
    success: boolean;
    /** Failure reason when `success` is false (e.g. "HTTP 403"). */
    error: string | null;
}

export type EscalationRecommendation =
    | "verifying"              // still within the failure budget, keep trying
    | "promote-to-browserbase" // outofband exhausted → bump to browserbase
    | "retire"                 // browserbase exhausted → disable + mark blocked
    | "graduate";              // proven and currently healthy → drop from queue

export interface PendingProxyVerificationItem {
    name: string;
    rung: ProxyRung;
    consecutiveFailures: number;
    lastError: string | null;
    lastAttempt: string;
    proven: boolean;
    recommendation: EscalationRecommendation;
}

export function emptyProxyVerificationState(): ProxyVerificationState {
    return { version: 1, entries: {} };
}

/**
 * Parse a persisted state blob, tolerating an absent/garbage file by returning
 * an empty state. Never throws — a missing counter must not break a build.
 */
export function parseProxyVerificationState(raw: string | null | undefined): ProxyVerificationState {
    if (!raw) return emptyProxyVerificationState();
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object") {
            return { version: 1, entries: parsed.entries };
        }
    } catch {
        // fall through to empty
    }
    return emptyProxyVerificationState();
}

/**
 * Fold this run's outcomes into the prior state.
 *
 * - `knownSources` is the set of source names currently configured with a proxy.
 *   Entries whose name is NOT in this set are pruned (source removed, or flipped
 *   to `proxy: false`). When omitted, it defaults to the names in `outcomes`.
 * - Sources in `knownSources` with a determined `outcome` this run are updated
 *   (increment/reset, rung-change reset). Sources in `knownSources` with no
 *   outcome this run (e.g. a browserbase source when the published
 *   `build-errors.json` was unavailable) are carried forward unchanged — a
 *   missing signal must not be counted as a failure.
 *
 * Pure: returns a new state, never mutates `prev`.
 */
export function evaluateProxyVerification(
    prev: ProxyVerificationState,
    outcomes: ProxyRunOutcome[],
    today: string,
    knownSources?: Set<string>,
): ProxyVerificationState {
    const known = knownSources ?? new Set(outcomes.map(o => o.name));
    const next: ProxyVerificationState = { version: 1, entries: {} };

    // Carry forward every still-configured entry unchanged; the outcome loop
    // below overwrites the ones we have a determination for this run.
    for (const [name, entry] of Object.entries(prev.entries)) {
        if (known.has(name)) next.entries[name] = { ...entry };
        // else: no longer a configured proxy source → pruned.
    }

    for (const outcome of outcomes) {
        if (!known.has(outcome.name)) continue; // ignore outcomes for pruned sources
        const prior = prev.entries[outcome.name];
        // A rung change resets the failure budget — a fresh rung earns its own
        // 3 strikes rather than inheriting the previous rung's count.
        const rungChanged = prior !== undefined && prior.rung !== outcome.rung;
        const base: ProxyVerificationEntry = prior && !rungChanged
            ? { ...prior }
            : {
                rung: outcome.rung,
                consecutiveFailures: 0,
                firstAttempt: prior?.firstAttempt ?? today,
                lastAttempt: today,
                lastError: null,
                lastSuccess: prior?.lastSuccess ?? null,
                proven: false,
            };

        base.rung = outcome.rung;
        base.lastAttempt = today;
        if (outcome.success) {
            base.consecutiveFailures = 0;
            base.lastError = null;
            base.lastSuccess = today;
            base.proven = true;
        } else {
            base.consecutiveFailures += 1;
            base.lastError = outcome.error ?? "unknown error";
        }
        next.entries[outcome.name] = base;
    }

    return next;
}

/** What should happen to a single entry given the failure threshold. */
export function recommendationFor(
    entry: ProxyVerificationEntry,
    threshold: number = ESCALATION_THRESHOLD,
): EscalationRecommendation {
    if (entry.consecutiveFailures === 0) {
        // Healthy this run. If it has ever proven itself, it's graduated out of
        // the queue; otherwise it's a brand-new entry mid-verification.
        return entry.proven ? "graduate" : "verifying";
    }
    if (entry.consecutiveFailures >= threshold) {
        return entry.rung === "outofband" ? "promote-to-browserbase" : "retire";
    }
    return "verifying";
}

/**
 * Build the non-fatal queue surfaced in `build-errors.json` and every reporting
 * surface. Proven-and-currently-healthy sources are omitted: they're working,
 * so there's nothing pending. Everything still being verified, or currently
 * regressed, is included with its recommendation.
 */
export function buildPendingProxyVerification(
    state: ProxyVerificationState,
    threshold: number = ESCALATION_THRESHOLD,
): PendingProxyVerificationItem[] {
    const items: PendingProxyVerificationItem[] = [];
    for (const [name, entry] of Object.entries(state.entries)) {
        const recommendation = recommendationFor(entry, threshold);
        if (recommendation === "graduate") continue; // healthy + proven → not pending
        items.push({
            name,
            rung: entry.rung,
            consecutiveFailures: entry.consecutiveFailures,
            lastError: entry.lastError,
            lastAttempt: entry.lastAttempt,
            proven: entry.proven,
            recommendation,
        });
    }
    // Stable, useful ordering: actionable escalations first, then by failure
    // count desc, then name for determinism.
    const rank: Record<EscalationRecommendation, number> = {
        retire: 0, "promote-to-browserbase": 1, verifying: 2, graduate: 3,
    };
    items.sort((a, b) =>
        rank[a.recommendation] - rank[b.recommendation] ||
        b.consecutiveFailures - a.consecutiveFailures ||
        a.name.localeCompare(b.name),
    );
    return items;
}
