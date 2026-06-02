import { describe, it, expect } from "vitest";
import {
    ESCALATION_THRESHOLD,
    emptyProxyVerificationState,
    parseProxyVerificationState,
    evaluateProxyVerification,
    recommendationFor,
    buildPendingProxyVerification,
    ProxyVerificationState,
    ProxyRunOutcome,
} from "./proxy-verification.js";

const T1 = "2026-06-01";
const T2 = "2026-06-02";
const T3 = "2026-06-03";
const T4 = "2026-06-04";

function fail(name: string, rung: "outofband" | "browserbase", error = "HTTP 403"): ProxyRunOutcome {
    return { name, rung, success: false, error };
}
function ok(name: string, rung: "outofband" | "browserbase"): ProxyRunOutcome {
    return { name, rung, success: true, error: null };
}

describe("parseProxyVerificationState", () => {
    it("returns empty state for null/garbage", () => {
        expect(parseProxyVerificationState(null).entries).toEqual({});
        expect(parseProxyVerificationState(undefined).entries).toEqual({});
        expect(parseProxyVerificationState("not json").entries).toEqual({});
        expect(parseProxyVerificationState("[]").entries).toEqual({});
    });
    it("round-trips a valid blob", () => {
        const state = evaluateProxyVerification(emptyProxyVerificationState(), [fail("a", "outofband")], T1);
        const parsed = parseProxyVerificationState(JSON.stringify(state));
        expect(parsed.entries.a.consecutiveFailures).toBe(1);
    });
});

describe("evaluateProxyVerification", () => {
    it("creates a new entry on first failure", () => {
        const s = evaluateProxyVerification(emptyProxyVerificationState(), [fail("eccr", "outofband")], T1);
        expect(s.entries.eccr).toMatchObject({
            rung: "outofband",
            consecutiveFailures: 1,
            firstAttempt: T1,
            lastAttempt: T1,
            lastError: "HTTP 403",
            lastSuccess: null,
            proven: false,
        });
    });

    it("increments consecutive failures across runs and preserves firstAttempt", () => {
        let s = evaluateProxyVerification(emptyProxyVerificationState(), [fail("eccr", "outofband")], T1);
        s = evaluateProxyVerification(s, [fail("eccr", "outofband", "HTTP 403 again")], T2);
        s = evaluateProxyVerification(s, [fail("eccr", "outofband")], T3);
        expect(s.entries.eccr.consecutiveFailures).toBe(3);
        expect(s.entries.eccr.firstAttempt).toBe(T1);
        expect(s.entries.eccr.lastAttempt).toBe(T3);
    });

    it("resets the counter and marks proven on success", () => {
        let s = evaluateProxyVerification(emptyProxyVerificationState(), [fail("sam", "outofband")], T1);
        s = evaluateProxyVerification(s, [fail("sam", "outofband")], T2);
        s = evaluateProxyVerification(s, [ok("sam", "outofband")], T3);
        expect(s.entries.sam).toMatchObject({
            consecutiveFailures: 0,
            lastError: null,
            lastSuccess: T3,
            proven: true,
        });
    });

    it("resets the failure budget when the rung changes (escalation)", () => {
        let s = evaluateProxyVerification(emptyProxyVerificationState(), [fail("eccr", "outofband")], T1);
        s = evaluateProxyVerification(s, [fail("eccr", "outofband")], T2);
        s = evaluateProxyVerification(s, [fail("eccr", "outofband")], T3); // 3 fails at outofband
        expect(s.entries.eccr.consecutiveFailures).toBe(3);
        // PR bumps it to browserbase; next run observed by the main build:
        s = evaluateProxyVerification(s, [fail("eccr", "browserbase", "sgcaptcha")], T4);
        expect(s.entries.eccr.rung).toBe("browserbase");
        expect(s.entries.eccr.consecutiveFailures).toBe(1); // fresh budget
        expect(s.entries.eccr.firstAttempt).toBe(T1); // history preserved
    });

    it("keeps proven=true across a later failure (regression is still proven)", () => {
        let s = evaluateProxyVerification(emptyProxyVerificationState(), [ok("sam", "outofband")], T1);
        s = evaluateProxyVerification(s, [fail("sam", "outofband")], T2);
        expect(s.entries.sam.proven).toBe(true);
        expect(s.entries.sam.consecutiveFailures).toBe(1);
        expect(s.entries.sam.lastSuccess).toBe(T1);
    });

    it("carries forward a still-configured source with no outcome this run", () => {
        // browserbase entry recorded on a run where prod data was available
        let s = evaluateProxyVerification(emptyProxyVerificationState(), [fail("bb", "browserbase")], T1, new Set(["bb"]));
        // next run: prod build-errors.json unavailable → no browserbase outcome,
        // but bb is still configured, so it must persist unchanged (not counted as a fail)
        s = evaluateProxyVerification(s, [], T2, new Set(["bb"]));
        expect(s.entries.bb).toMatchObject({ rung: "browserbase", consecutiveFailures: 1, lastAttempt: T1 });
    });

    it("prunes an entry no longer in knownSources (source removed / proxy:false)", () => {
        let s = evaluateProxyVerification(emptyProxyVerificationState(),
            [fail("gone", "outofband"), fail("stay", "outofband")], T1, new Set(["gone", "stay"]));
        s = evaluateProxyVerification(s, [fail("stay", "outofband")], T2, new Set(["stay"]));
        expect(s.entries.gone).toBeUndefined();
        expect(s.entries.stay).toBeDefined();
    });

    it("ignores an outcome for a source not in knownSources", () => {
        const s = evaluateProxyVerification(emptyProxyVerificationState(),
            [fail("ghost", "outofband")], T1, new Set<string>());
        expect(s.entries.ghost).toBeUndefined();
    });

    it("defaults knownSources to the outcome names when omitted", () => {
        const s = evaluateProxyVerification(emptyProxyVerificationState(), [fail("a", "outofband")], T1);
        expect(s.entries.a.consecutiveFailures).toBe(1);
    });
});

describe("recommendationFor", () => {
    const base = {
        rung: "outofband" as const,
        firstAttempt: T1,
        lastAttempt: T1,
        lastError: null as string | null,
        lastSuccess: null as string | null,
        proven: false,
    };
    it("verifying while under threshold", () => {
        expect(recommendationFor({ ...base, consecutiveFailures: 0 })).toBe("verifying");
        expect(recommendationFor({ ...base, consecutiveFailures: ESCALATION_THRESHOLD - 1 })).toBe("verifying");
    });
    it("promotes outofband at threshold", () => {
        expect(recommendationFor({ ...base, rung: "outofband", consecutiveFailures: ESCALATION_THRESHOLD }))
            .toBe("promote-to-browserbase");
    });
    it("retires browserbase at threshold", () => {
        expect(recommendationFor({ ...base, rung: "browserbase", consecutiveFailures: ESCALATION_THRESHOLD }))
            .toBe("retire");
    });
    it("graduates a proven, currently-healthy source", () => {
        expect(recommendationFor({ ...base, proven: true, consecutiveFailures: 0 })).toBe("graduate");
    });
});

describe("buildPendingProxyVerification", () => {
    it("omits proven, currently-healthy sources", () => {
        const s = evaluateProxyVerification(emptyProxyVerificationState(), [ok("sam", "outofband")], T1);
        expect(buildPendingProxyVerification(s)).toEqual([]);
    });

    it("lists verifying and escalation candidates, escalations first", () => {
        let s: ProxyVerificationState = emptyProxyVerificationState();
        // a: 3 outofband fails → promote
        s = evaluateProxyVerification(s, [fail("a", "outofband")], T1);
        s = evaluateProxyVerification(s, [fail("a", "outofband")], T2);
        s = evaluateProxyVerification(s, [fail("a", "outofband")], T3);
        // b: 1 fail → verifying (carried since main build owns browserbase only in its run;
        // here we just add it in the same outofband run)
        s = evaluateProxyVerification(s, [fail("a", "outofband"), fail("b", "outofband")], T4);
        // c: browserbase, 3 fails → retire
        let bb = evaluateProxyVerification(emptyProxyVerificationState(), [fail("c", "browserbase")], T1);
        bb = evaluateProxyVerification(bb, [fail("c", "browserbase")], T2);
        bb = evaluateProxyVerification(bb, [fail("c", "browserbase")], T3);
        s.entries.c = bb.entries.c;

        const pending = buildPendingProxyVerification(s);
        const byName = Object.fromEntries(pending.map(p => [p.name, p]));
        expect(byName.c.recommendation).toBe("retire");
        expect(byName.a.recommendation).toBe("promote-to-browserbase");
        expect(byName.b.recommendation).toBe("verifying");
        // ordering: retire (c) before promote (a) before verifying (b)
        expect(pending.map(p => p.name)).toEqual(["c", "a", "b"]);
    });
});
