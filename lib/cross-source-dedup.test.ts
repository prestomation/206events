import { describe, it, expect } from "vitest";
import {
    scorePair,
    tierFor,
    locationContradiction,
    findDuplicates,
    applyDuplicateMarks,
    resolutionsFromCache,
    pairKey,
    DedupEvent,
} from "./cross-source-dedup.js";

// Fixtures drawn from real cross-source cases in the prod events-index
// (2026-06-17 snapshot). See docs/cross-source-event-dedup.md.

const day = "2026-09-13";
const ev = (e: Partial<DedupEvent> & { icsUrl: string; summary: string }): DedupEvent => ({
    date: `${day}T11:00-07:00[America/Los_Angeles]`,
    endDate: `${day}T19:00-07:00[America/Los_Angeles]`,
    ...e,
});

describe("scorePair / tierFor", () => {
    it("HIGH-merges a publisher's overlapping themed sub-feeds (identical event)", () => {
        // seatoday-all <-> seatoday-community: same title, same OSM feature, overlap.
        const a = ev({ icsUrl: "seatoday-all.ics", summary: "Free Outdoor Yoga", location: "Cal Anderson Park, Seattle, WA 98122", lat: 47.617, lng: -122.319, osmType: "way", osmId: 111 });
        const b = ev({ icsUrl: "seatoday-community.ics", summary: "Free Outdoor Yoga", location: "Cal Anderson Park, Seattle, WA 98122", lat: 47.617, lng: -122.319, osmType: "way", osmId: 111 });
        expect(tierFor(scorePair(a, b))).toBe("high");
    });

    it("routes a campus-scale match (Seattle Center, ~166m apart) to MED, not HIGH", () => {
        // Live Aloha: same title, same ZIP, but Armory vs campus centroid >75m.
        const a = ev({ icsUrl: "seattle-center-festal.ics", summary: "Live Aloha Hawaiian Cultural Festival", location: "Seattle Center, 305 Harrison St, Seattle, WA 98109", lat: 47.6235, lng: -122.3517 });
        const b = ev({ icsUrl: "external-nw-asian-weekly.ics", summary: "Live Aloha Hawaiian Cultural Festival", location: "Armory Food & Event Hall, 305 Harrison St, Seattle, WA, 98109", lat: 47.6250, lng: -122.3517 });
        const s = scorePair(a, b);
        expect(s.distanceM).toBeGreaterThan(75);
        expect(s.distanceM).toBeLessThan(500);
        expect(tierFor(s)).toBe("med");
    });

    it("matches coordless listings on strong location text (MED)", () => {
        // seattle-gov-arts <-> seattle-gov-city-wide: same title and identical
        // (coordless) venue string — a real prod pattern. loc-text clears the
        // MED floor; no coords/osm so it can't reach HIGH.
        const loc = "ARTS at King Street Station, 303 South Jackson Street, Seattle, WA 98104";
        const a = ev({ icsUrl: "external-seattle-gov-arts.ics", summary: "First Thursday: Free Zines & Mobile Book Fair", location: loc });
        const b = ev({ icsUrl: "external-seattle-gov-city-wide.ics", summary: "First Thursday: Free Zines & Mobile Book Fair", location: loc });
        const s = scorePair(a, b);
        expect(s.distanceM).toBeNull();
        expect(s.locText).toBeGreaterThanOrEqual(0.5);
        expect(tierFor(s)).toBe("med");
    });

    it("VETOES a coords/osm match when ZIPs contradict (Stoup Ballard vs Capitol Hill)", () => {
        // Geocoding bug: both addresses cached to identical coords + osmId.
        const a = ev({ icsUrl: "stoup-ballard.ics", summary: "Trivia at Stoup Brewing Ballard with Head in the Clouds", location: "Stoup Brewing Ballard, 1108 NW 52nd St, Seattle, WA 98107", lat: 47.6666, lng: -122.3712, osmType: "node", osmId: 999 });
        const b = ev({ icsUrl: "stoup-capitol-hill.ics", summary: "Trivia at Stoup Capitol Hill with Head in the Clouds", location: "Stoup Brewing Capitol Hill, 1158 Broadway, Seattle, WA 98122", lat: 47.6666, lng: -122.3712, osmType: "node", osmId: 999 });
        const s = scorePair(a, b);
        expect(s.osmSame).toBe(true);
        expect(s.distanceM).toBe(0);
        expect(locationContradiction(a, b)).toBe(true);
        expect(tierFor(s)).not.toBe("high"); // veto kept it out of auto-merge
    });

    it("does not match different events at the same venue (no time overlap)", () => {
        const a = ev({ icsUrl: "venue-a.ics", summary: "Morning Set", location: "Nectar Lounge, Seattle, WA 98103", lat: 47.65, lng: -122.35, date: `${day}T10:00-07:00[America/Los_Angeles]`, endDate: `${day}T12:00-07:00[America/Los_Angeles]` });
        const b = ev({ icsUrl: "venue-b.ics", summary: "Evening Set", location: "Nectar Lounge, Seattle, WA 98103", lat: 47.65, lng: -122.35, date: `${day}T20:00-07:00[America/Los_Angeles]`, endDate: `${day}T23:00-07:00[America/Los_Angeles]` });
        expect(tierFor(scorePair(a, b))).toBeNull(); // titles differ AND no overlap
    });
});

describe("findDuplicates", () => {
    const a = ev({ icsUrl: "seatoday-all.ics", summary: "Free Outdoor Yoga", location: "Cal Anderson Park, Seattle, WA 98122", lat: 47.617, lng: -122.319, osmType: "way", osmId: 111 });
    const b = ev({ icsUrl: "seatoday-community.ics", summary: "Free Outdoor Yoga", location: "Cal Anderson Park, Seattle, WA 98122", lat: 47.617, lng: -122.319, osmType: "way", osmId: 111 });
    const c = ev({ icsUrl: "seatoday-arts.ics", summary: "Free Outdoor Yoga", location: "Cal Anderson Park, Seattle, WA 98122", lat: 47.617, lng: -122.319, osmType: "way", osmId: 111 });
    const lonely = ev({ icsUrl: "other.ics", summary: "Completely Different Thing", location: "Elsewhere, Seattle, WA 98101", lat: 47.6, lng: -122.33 });

    it("collapses a 3-source cluster into one canonical group with dedupedSources", () => {
        const { groups } = findDuplicates([a, b, c, lonely]);
        expect(groups).toHaveLength(1);
        const g = groups[0];
        expect(g.suppressed).toHaveLength(2);
        // Canonical is the lexicographically smallest (icsUrl, eventKey): seatoday-all.
        expect(g.canonical.icsUrl).toBe("seatoday-all.ics");
        expect(g.sources).toEqual(["seatoday-arts.ics", "seatoday-community.ics"]);
    });

    it("is deterministic regardless of input order", () => {
        const g1 = findDuplicates([a, b, c]).groups;
        const g2 = findDuplicates([c, a, b]).groups;
        expect(g2).toEqual(g1);
    });

    it("emits a MED candidate for a campus-scale pair (not a HIGH merge)", () => {
        const f = ev({ icsUrl: "seattle-center-festal.ics", summary: "Live Aloha Hawaiian Cultural Festival", location: "Seattle Center, 305 Harrison St, Seattle, WA 98109", lat: 47.6235, lng: -122.3517 });
        const g = ev({ icsUrl: "external-nw-asian-weekly.ics", summary: "Live Aloha Hawaiian Cultural Festival", location: "Armory Food & Event Hall, 305 Harrison St, Seattle, WA, 98109", lat: 47.6250, lng: -122.3517 });
        const res = findDuplicates([f, g]);
        expect(res.groups).toHaveLength(0);
        expect(res.candidates).toHaveLength(1);
        expect(res.candidates[0].key).toBe(pairKey(f, g));
    });

    it("respects the resolver cache: 'confirmed' promotes a MED pair to a merge", () => {
        const f = ev({ icsUrl: "seattle-center-festal.ics", summary: "Live Aloha Hawaiian Cultural Festival", location: "Seattle Center, 305 Harrison St, Seattle, WA 98109", lat: 47.6235, lng: -122.3517 });
        const g = ev({ icsUrl: "external-nw-asian-weekly.ics", summary: "Live Aloha Hawaiian Cultural Festival", location: "Armory Food & Event Hall, 305 Harrison St, Seattle, WA, 98109", lat: 47.6250, lng: -122.3517 });
        const resolved = new Map<string, "confirmed" | "rejected">([[pairKey(f, g), "confirmed"]]);
        const res = findDuplicates([f, g], { resolved });
        expect(res.groups).toHaveLength(1);
        expect(res.candidates).toHaveLength(0);
    });

    it("respects the resolver cache: 'rejected' drops a HIGH pair entirely", () => {
        const resolved = new Map<string, "confirmed" | "rejected">([[pairKey(a, b), "rejected"]]);
        // a<->b rejected; a<->c and b<->c still merge, so the group shrinks but
        // the rejected edge is gone. With only a,b present it's fully dropped.
        const res = findDuplicates([a, b], { resolved });
        expect(res.groups).toHaveLength(0);
        expect(res.candidates).toHaveLength(0);
    });

    it("applyDuplicateMarks stamps canonical + suppressed in place", () => {
        const events = [a, b, c].map(e => ({ ...e })); // fresh copies
        const { groups } = findDuplicates(events);
        applyDuplicateMarks(groups);
        const canon = events.find(e => e.icsUrl === "seatoday-all.ics")!;
        const supp = events.filter(e => e.icsUrl !== "seatoday-all.ics");
        expect(canon.duplicateGroupId).toBe(groups[0].id);
        expect(canon.dedupedSources).toEqual(["seatoday-arts.ics", "seatoday-community.ics"]);
        expect(canon.duplicateOf).toBeUndefined();
        for (const s of supp) {
            expect(s.duplicateOf).toBe(groups[0].id);
            expect(s.duplicateGroupId).toBe(groups[0].id);
            expect(s.dedupedSources).toBeUndefined();
        }
    });
});

describe("findDuplicates — role-aware canonical pick", () => {
    // A real-world event listed by both an aggregator and the venue itself.
    // The aggregator's icsUrl sorts lexicographically *before* the venue's, so
    // without role awareness it would win the canonical slot. sourceRole flips
    // that: the venue's own listing should be canonical and attribute the
    // aggregator copy as a deduped source.
    const venue = ev({ icsUrl: "neumos-all.ics", summary: "Big Show", location: "Neumos, 925 E Pike St, Seattle, WA 98122", lat: 47.6142, lng: -122.3185, osmType: "node", osmId: 42 });
    const aggregator = ev({ icsUrl: "events12-seattle.ics", summary: "Big Show", location: "Neumos, 925 E Pike St, Seattle, WA 98122", lat: 47.6142, lng: -122.3185, osmType: "node", osmId: 42 });

    it("prefers the venue over the aggregator as canonical", () => {
        const roleByIcsUrl = new Map<string, "venue" | "aggregator">([
            ["neumos-all.ics", "venue"],
            ["events12-seattle.ics", "aggregator"],
        ]);
        const { groups } = findDuplicates([aggregator, venue], { roleByIcsUrl });
        expect(groups).toHaveLength(1);
        expect(groups[0].canonical.icsUrl).toBe("neumos-all.ics");
        expect(groups[0].sources).toEqual(["events12-seattle.ics"]);
    });

    it("is order-independent and picks the venue even when the aggregator is first", () => {
        const roleByIcsUrl = new Map<string, "venue" | "aggregator">([
            ["neumos-all.ics", "venue"],
            ["events12-seattle.ics", "aggregator"],
        ]);
        const g1 = findDuplicates([venue, aggregator], { roleByIcsUrl }).groups;
        const g2 = findDuplicates([aggregator, venue], { roleByIcsUrl }).groups;
        expect(g1[0].canonical.icsUrl).toBe("neumos-all.ics");
        expect(g2).toEqual(g1);
    });

    it("falls back to lexicographic order when roles tie (both aggregators)", () => {
        const roleByIcsUrl = new Map<string, "venue" | "aggregator">([
            ["neumos-all.ics", "aggregator"],
            ["events12-seattle.ics", "aggregator"],
        ]);
        const { groups } = findDuplicates([venue, aggregator], { roleByIcsUrl });
        // events12-seattle.ics < neumos-all.ics lexicographically.
        expect(groups[0].canonical.icsUrl).toBe("events12-seattle.ics");
    });

    it("treats a missing role as a venue so it outranks a known aggregator", () => {
        // Only the aggregator carries a role; the other feed is unmarked.
        const roleByIcsUrl = new Map<string, "venue" | "aggregator">([
            ["events12-seattle.ics", "aggregator"],
        ]);
        const { groups } = findDuplicates([aggregator, venue], { roleByIcsUrl });
        expect(groups[0].canonical.icsUrl).toBe("neumos-all.ics");
    });

    it("preserves pure-lexicographic order when no roles are supplied", () => {
        const { groups } = findDuplicates([venue, aggregator]);
        // events12-seattle.ics < neumos-all.ics — unchanged legacy behavior.
        expect(groups[0].canonical.icsUrl).toBe("events12-seattle.ics");
    });
});

describe("resolutionsFromCache", () => {
    it("extracts confirmed/rejected decisions and tolerates a cold cache", () => {
        expect(resolutionsFromCache(null).size).toBe(0);
        expect(resolutionsFromCache({ resolutions: {} }).size).toBe(0);
        const m = resolutionsFromCache({
            resolutions: {
                "k1": { decision: "confirmed" },
                "k2": { decision: "rejected", note: "different venues" },
                "k3": { decision: "bogus" as any },
            },
        });
        expect(m.get("k1")).toBe("confirmed");
        expect(m.get("k2")).toBe("rejected");
        expect(m.has("k3")).toBe(false);
    });
});
