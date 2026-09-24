import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "@js-joda/timezone";
import {
    parseListing,
    extractJsonLdEvent,
    extractCostField,
    parseLdDateTime,
    isSeattleEvent,
    isMultiDaySpan,
    parseDetailEvent,
    JsonLdEvent,
} from "./ripper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
const BASE = "https://www.seattleschild.com/events/";

describe("parseListing", () => {
    const entries = parseListing(read("sample-listing.html"));

    it("finds every article on the listing sample", () => {
        expect(entries.length).toBe(20);
    });

    it("flags prose-recurring listings", () => {
        const gym = entries.find(e => e.title === "Family Open Gym");
        expect(gym?.recurring).toBe(true);
        const fest = entries.find(e => e.title === "Fauntleroy Fall Festival");
        expect(fest?.recurring).toBe(false);
        expect(fest?.url).toBe(`${BASE}fauntleroy-fall-festival/`);
    });

    it("decodes HTML entities in titles", () => {
        expect(entries.some(e => e.title.includes("&#039;"))).toBe(false);
    });
});

describe("parseLdDateTime", () => {
    it("parses 12-hour times", () => {
        expect(parseLdDateTime("2026-10-18 01:00 PM")?.dt.toString()).toBe("2026-10-18T13:00");
        expect(parseLdDateTime("2026-10-18 12:30 PM")?.dt.toString()).toBe("2026-10-18T12:30");
        expect(parseLdDateTime("2026-10-18 12:15 AM")?.dt.toString()).toBe("2026-10-18T00:15");
    });
    it("reports a missing time", () => {
        const r = parseLdDateTime("2026-12-12 ");
        expect(r?.hasTime).toBe(false);
        expect(r?.dt.toLocalDate().toString()).toBe("2026-12-12");
    });
    it("returns null for garbage", () => {
        expect(parseLdDateTime("sometime soon")).toBeNull();
        expect(parseLdDateTime(undefined)).toBeNull();
    });
});

describe("extractCostField", () => {
    it("reads Free/Fee from the page's own Cost block (live HTML shape, 2026-09-24)", () => {
        const freeHtml = '<div class="event-cost"><div class="row"><div class="col-md-6 mb-3 mb-md-0"><h2>Cost</h2><p>Free</p></p></div></p></div></p></div>';
        expect(extractCostField(freeHtml)).toBe("free");

        const feeHtml = '<div class="event-cost"><div class="row"><div class="col-md-6 mb-3 mb-md-0"><h2>Cost</h2><p>Fee</p></p></div></p></div></p></div>';
        expect(extractCostField(feeHtml)).toBe("fee");
    });

    it("returns undefined when the page has no Cost block", () => {
        expect(extractCostField("<html><body>no cost info here</body></html>")).toBeUndefined();
    });
});

describe("detail pages", () => {
    it("parses a Seattle event with times and address", () => {
        const ld = extractJsonLdEvent(read("sample-detail-fauntleroy-fall-festival.html"))!;
        expect(ld).not.toBeNull();
        expect(isSeattleEvent(ld)).toBe(true);
        expect(isMultiDaySpan(ld)).toBe(false);
        const results = parseDetailEvent(ld, `${BASE}fauntleroy-fall-festival/`);
        expect(results).toHaveLength(1);
        const ev = results[0];
        if (!("date" in ev)) throw new Error("expected event");
        expect(ev.summary).toBe("Fauntleroy Fall Festival");
        expect(ev.date.toLocalDateTime().toString()).toBe("2026-10-18T13:00");
        expect(ev.duration.toHours()).toBe(3);
        expect(ev.location).toContain("9131 California Ave SW, Seattle, WA");
        expect(ev.id).toBe("seattles-child-fauntleroy-fall-festival-2026-10-18");
    });

    it("filters out non-Seattle and address-less events", () => {
        const redmond = extractJsonLdEvent(read("sample-detail-bigfoot-kids-book-festival-2.html"))!;
        expect(isSeattleEvent(redmond)).toBe(false);
        const noAddr = extractJsonLdEvent(read("sample-detail-mid-autumn-festival-at-seattle-chinese-garden.html"))!;
        expect(isSeattleEvent(noAddr)).toBe(false);
    });

    it("emits an UncertaintyError when the start time is blank", () => {
        const ld = extractJsonLdEvent(read("sample-detail-christmas-rush-fun-run-walk.html"))!;
        const results = parseDetailEvent(ld, `${BASE}christmas-rush-fun-run-walk/`);
        expect(results).toHaveLength(2);
        const [ev, unc] = results;
        if (!("date" in ev)) throw new Error("expected event");
        expect(ev.date.toLocalDateTime().toString()).toBe("2026-12-12T10:00");
        expect("type" in unc && unc.type).toBe("Uncertainty");
    });

    it("detects multi-day spans", () => {
        const ld: JsonLdEvent = { "@type": "Event", name: "Harvest", startDate: "2026-09-12 10:00 AM", endDate: "2026-10-31 06:00 PM" };
        expect(isMultiDaySpan(ld)).toBe(true);
    });

    it("returns a ParseError for an unparseable start date", () => {
        const results = parseDetailEvent({ "@type": "Event", name: "X", startDate: "TBD" }, `${BASE}x/`);
        expect(results).toHaveLength(1);
        expect("type" in results[0] && results[0].type).toBe("ParseError");
    });

    it("sets cost { min: 0 } when isAccessibleForFree is true", () => {
        const ld: JsonLdEvent = {
            name: "Free Family Day",
            startDate: "2026-10-05 10:00 AM",
            endDate: "2026-10-05 03:00 PM",
            isAccessibleForFree: true,
        };
        const results = parseDetailEvent(ld, `${BASE}free-family-day/`);
        expect(results).toHaveLength(1);
        if (!("date" in results[0])) throw new Error("expected event");
        expect(results[0].cost).toEqual({ min: 0 });
    });

    it("does not set cost when isAccessibleForFree is absent or false", () => {
        const ldAbsent: JsonLdEvent = { name: "Paid Workshop", startDate: "2026-10-05 10:00 AM" };
        const r1 = parseDetailEvent(ldAbsent, `${BASE}paid-workshop/`);
        if (!("date" in r1[0])) throw new Error("expected event");
        expect(r1[0].cost).toBeUndefined();

        const ldFalse: JsonLdEvent = { name: "Paid Workshop", startDate: "2026-10-05 10:00 AM", isAccessibleForFree: false };
        const r2 = parseDetailEvent(ldFalse, `${BASE}paid-workshop/`);
        if (!("date" in r2[0])) throw new Error("expected event");
        expect(r2[0].cost).toBeUndefined();
    });

    it("an explicit isAccessibleForFree: false wins over an unrelated 'free' mention in the description", () => {
        const ld: JsonLdEvent = {
            name: "Paid Workshop",
            startDate: "2026-10-05 10:00 AM",
            isAccessibleForFree: false,
            description: "Free parking available. Tickets $20 at the door.",
        };
        const results = parseDetailEvent(ld, `${BASE}paid-workshop/`);
        if (!("date" in results[0])) throw new Error("expected event");
        expect(results[0].cost).toBeUndefined();
    });

    it("an explicit isAccessibleForFree: false also wins over a stale/inconsistent page Cost field", () => {
        const ld: JsonLdEvent = { name: "Paid Workshop", startDate: "2026-10-05 10:00 AM", isAccessibleForFree: false };
        const results = parseDetailEvent(ld, `${BASE}paid-workshop/`, "free");
        if (!("date" in results[0])) throw new Error("expected event");
        expect(results[0].cost).toBeUndefined();
    });

    it("falls back to a 'free' claim in the title or description when isAccessibleForFree is absent (live example, 2026-09-24)", () => {
        const ld: JsonLdEvent = {
            name: "Free Wooden Boat Story Time at SLU",
            startDate: "2026-09-27 02:00 PM",
            endDate: "2026-09-27 02:45 PM",
            description: "Free Wooden Boat Storytime at South Lake Union! Join Sue Kimpton for storytime in the Boathouse.",
        };
        const results = parseDetailEvent(ld, `${BASE}free-wooden-boat-story-time-at-slu/`);
        if (!("date" in results[0])) throw new Error("expected event");
        expect(results[0].cost).toEqual({ min: 0 });
    });

    it("uses the page's own Cost field (Free/Fee) when JSON-LD and text give no signal (live example, 2026-09-24)", () => {
        const ldFree: JsonLdEvent = { name: "Toy Boat Building at South Lake Union", startDate: "2026-09-27 11:00 AM" };
        const freeResult = parseDetailEvent(ldFree, `${BASE}toy-boat-building/`, "free");
        if (!("date" in freeResult[0])) throw new Error("expected event");
        expect(freeResult[0].cost).toEqual({ min: 0 });

        const ldFee: JsonLdEvent = { name: "Beauty and the Beast: Opening Night", startDate: "2026-12-22 07:00 PM" };
        const feeResult = parseDetailEvent(ldFee, `${BASE}beauty-and-the-beast/`, "fee");
        if (!("date" in feeResult[0])) throw new Error("expected event");
        expect(feeResult[0].cost).toEqual({ paid: true });
    });

    it("does not mistake 'freedom' or a negated free claim for a free-admission signal", () => {
        const ldFreedom: JsonLdEvent = { name: "Freedom Day at NAAM", startDate: "2026-10-05 10:00 AM" };
        const r1 = parseDetailEvent(ldFreedom, `${BASE}freedom-day/`);
        if (!("date" in r1[0])) throw new Error("expected event");
        expect(r1[0].cost).toBeUndefined();

        const ldNegated: JsonLdEvent = {
            name: "Members Preview Night",
            startDate: "2026-10-05 10:00 AM",
            description: "This is not a free event — tickets required for non-members.",
        };
        const r2 = parseDetailEvent(ldNegated, `${BASE}members-preview/`);
        if (!("date" in r2[0])) throw new Error("expected event");
        expect(r2[0].cost).toBeUndefined();
    });
});
