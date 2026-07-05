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

describe("strong same-venue/same-instant signal", () => {
    // Real prod case: a venue feed (The Triple Door) and a partner feed
    // (Book Larder, republishing the show it hosts there) list the same event
    // with very differently worded titles. After the Book Larder ripper resolves
    // the off-site venue, both carry the Triple Door's OSM node and the identical
    // 5 PM start — but the titles' Jaccard (~0.36) sits below titleGate (0.4).
    const at = (time: string, endTime: string) => ({ date: `${day}T${time}-07:00[America/Los_Angeles]`, endDate: `${day}T${endTime}-07:00[America/Los_Angeles]` });
    const bookLarder5pm = ev({ icsUrl: "book-larder-all-events.ics", summary: "Tasting Notes with Kenji Lopez-Alt + Seattle Chamber Music Society", location: "The Triple Door, 216 Union St, Seattle, WA 98101", lat: 47.6082, lng: -122.3387, osmType: "node", osmId: 2404249354, ...at("17:00", "22:00") });
    const tripleDoor5pm = ev({ icsUrl: "triple-door-the-triple-door.ics", summary: "Tasting Notes - Hosted by Kenji Lopez-Alt & James Ehnes", location: "Mainstage Theatre, 216 Union Street, Seattle", lat: 47.6082, lng: -122.3387, osmType: "node", osmId: 2404249354, ...at("17:00", "22:00") });
    const tripleDoor830pm = ev({ icsUrl: "triple-door-the-triple-door.ics", summary: "Tasting Notes - Hosted by Kenji Lopez-Alt & James Ehnes", location: "Mainstage Theatre, 216 Union Street, Seattle", lat: 47.6082, lng: -122.3387, osmType: "node", osmId: 2404249354, ...at("20:30", "23:30") });

    it("scores sameStartInstant true only for the identical start", () => {
        expect(scorePair(bookLarder5pm, tripleDoor5pm).sameStartInstant).toBe(true);
        expect(scorePair(bookLarder5pm, tripleDoor830pm).sameStartInstant).toBe(false);
    });

    it("surfaces the sub-titleGate 5 PM pair as MED, not null", () => {
        const s = scorePair(bookLarder5pm, tripleDoor5pm);
        expect(s.title).toBeLessThan(0.4);          // below titleGate
        expect(s.title).toBeGreaterThanOrEqual(0.3); // above the strong-signal floor
        expect(s.osmSame).toBe(true);
        expect(tierFor(s)).toBe("med");
    });

    it("findDuplicates queues the pair as a candidate despite the low title", () => {
        const { groups, candidates } = findDuplicates([bookLarder5pm, tripleDoor5pm]);
        expect(groups).toHaveLength(0);             // MED, never auto-merged
        expect(candidates).toHaveLength(1);
        expect(candidates[0].key).toBe(pairKey(bookLarder5pm, tripleDoor5pm));
    });

    it("does NOT match the 8:30 seating against the 5 PM copy (different instant)", () => {
        // Keyed on the exact instant, so the venue's later seating stays distinct
        // even though the 5–10 PM window overlaps 8:30.
        expect(tierFor(scorePair(bookLarder5pm, tripleDoor830pm))).toBeNull();
        const { candidates } = findDuplicates([bookLarder5pm, tripleDoor830pm]);
        expect(candidates).toHaveLength(0);
    });

    it("requires a minimal title overlap (floor) even with identical venue+instant", () => {
        const unrelated = ev({ icsUrl: "other.ics", summary: "Completely Different Poetry Reading", location: "Mainstage Theatre, 216 Union Street, Seattle", lat: 47.6082, lng: -122.3387, osmType: "node", osmId: 2404249354, ...at("17:00", "22:00") });
        const s = scorePair(bookLarder5pm, unrelated);
        expect(s.sameStartInstant).toBe(true);
        expect(s.title).toBeLessThan(0.3);          // below the floor
        expect(tierFor(s)).toBeNull();
    });

    it("requires the same OSM node (different venue at same instant does not fire)", () => {
        const elsewhere = ev({ icsUrl: "other.ics", summary: "Tasting Notes - Hosted by Kenji Lopez-Alt & James Ehnes", location: "Somewhere Else, Seattle", osmType: "node", osmId: 555, ...at("17:00", "22:00") });
        const s = scorePair(bookLarder5pm, elsewhere);
        expect(s.osmSame).toBe(false);
        expect(tierFor(s)).toBeNull();
    });

    it("escalates to a merge once a human confirms the strong-signal candidate", () => {
        // The resolver's 'confirmed' decision promotes the sub-titleGate pair
        // from MED candidate to a HIGH merge — the intended human-in-the-loop path.
        const resolved = new Map<string, "confirmed" | "rejected">([[pairKey(bookLarder5pm, tripleDoor5pm), "confirmed"]]);
        const { groups, candidates } = findDuplicates([bookLarder5pm, tripleDoor5pm], { resolved });
        expect(groups).toHaveLength(1);
        expect(groups[0].suppressed).toHaveLength(1);
        expect(candidates).toHaveLength(0);
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

    it("normalizes NFD cache keys to NFC so they match build-generated keys", () => {
        // Seatoday delivers titles with NFD characters (e.g. ó as o + combining
        // acute U+0301). The cache may store NFC or NFD depending on how the
        // agent wrote the key. resolutionsFromCache must normalize both so that
        // a build-generated NFC pairKey hits the cache entry.
        const nfdTitle = "ólǫ́"; // ó + l + o-ogonek + combining acute (NFD)
        const nfcTitle = nfdTitle.normalize("NFC"); // ól + ǫ́ (NFC)
        const nfdKey = `seatoday-all.ics ${nfdTitle}|2026-07-05T10:00:00-07:00[America/Los_Angeles]::seatoday-arts.ics ${nfdTitle}|2026-07-05T10:00:00-07:00[America/Los_Angeles]`;
        const nfcKey = nfdKey.normalize("NFC");
        expect(nfdKey).not.toBe(nfcKey); // confirm they're actually different

        const m = resolutionsFromCache({ resolutions: { [nfdKey]: { decision: "confirmed" } } });
        expect(m.get(nfcKey)).toBe("confirmed"); // lookup with NFC key hits NFD cache entry
    });
});

describe("pairKey unicode normalization", () => {
    it("produces the same key for NFD and NFC event summaries", () => {
        const nfdSummary = "Eric-Paul Riege: ojo|-|ólǫ́"; // NFD
        const nfcSummary = nfdSummary.normalize("NFC");                     // NFC
        expect(nfdSummary).not.toBe(nfcSummary); // confirm input actually differs

        const date = "2026-07-05T10:00:00-07:00[America/Los_Angeles]";
        const aNFD = ev({ icsUrl: "seatoday-all.ics", summary: nfdSummary, date });
        const bNFD = ev({ icsUrl: "seatoday-arts.ics", summary: nfdSummary, date });
        const aNFC = ev({ icsUrl: "seatoday-all.ics", summary: nfcSummary, date });
        const bNFC = ev({ icsUrl: "seatoday-arts.ics", summary: nfcSummary, date });

        expect(pairKey(aNFD, bNFD)).toBe(pairKey(aNFC, bNFC));
    });
});
