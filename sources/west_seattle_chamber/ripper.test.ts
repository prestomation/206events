import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LocalDate } from "@js-joda/core";
import "@js-joda/timezone";
import {
    calendarMonthUrls,
    detailUrl,
    extractDetailSlugs,
    parseDetailPage,
    parseFeesText,
    slugDate,
} from "./ripper.js";
import { RipperCalendarEvent, UncertaintyError } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), "utf-8");
}

describe("extractDetailSlugs", () => {
    test("extracts unique, entity-decoded slugs from a month calendar page", () => {
        const slugs = extractDetailSlugs(readSample("sample-calendar.html"));
        expect(slugs.length).toBe(34);
        expect(slugs).toContain("business-after-hours-tbd-09-23-2026-12899");
        expect(slugs).toContain("feg-pokémon-league-09-24-2026-16806");
        expect(slugs.every(s => !s.includes("&#"))).toBe(true);
        expect(new Set(slugs).size).toBe(slugs.length);
    });
});

describe("calendarMonthUrls", () => {
    test("returns the current month and the following months", () => {
        expect(calendarMonthUrls(LocalDate.of(2026, 11, 23), 3)).toEqual([
            "https://westseattle.wschamber.com/events/calendar/2026-11-01",
            "https://westseattle.wschamber.com/events/calendar/2026-12-01",
            "https://westseattle.wschamber.com/events/calendar/2027-01-01",
        ]);
    });
});

describe("slugDate", () => {
    test("reads the occurrence date embedded in recurring slugs", () => {
        expect(slugDate("men-s-therapy-group-09-29-2026-15027")?.toString()).toBe("2026-09-29");
    });
    test("returns null for one-off slugs", () => {
        expect(slugDate("electric-butter-is-churning-three-17520")).toBeNull();
    });
});

describe("detailUrl", () => {
    test("percent-encodes non-ASCII slugs", () => {
        expect(detailUrl("feg-pokémon-league-09-24-2026-16806"))
            .toBe("https://westseattle.wschamber.com/events/details/feg-pok%C3%A9mon-league-09-24-2026-16806");
    });
});

describe("parseDetailPage", () => {
    test("parses title, UTC instants into Pacific time, and street address", () => {
        const results = parseDetailPage(readSample("sample-detail-full.html"), "business-after-hours-tbd-09-23-2026-12899");
        expect(results).toHaveLength(1);
        const ev = results[0] as RipperCalendarEvent;
        expect(ev.summary).toBe("Business After Hours: West Seattle Coworking");
        expect(ev.date.toLocalDateTime().toString()).toBe("2026-09-23T17:30");
        expect(ev.duration.toMinutes()).toBe(120);
        expect(ev.location).toBe("9030 35th Ave SW, Seattle, WA 98136");
        expect(ev.id).toBe("business-after-hours-tbd-09-23-2026-12899");
        expect(ev.url).toBe("https://westseattle.wschamber.com/events/details/business-after-hours-tbd-09-23-2026-12899");
        expect(ev.description).toContain("West Seattle Coworking");
        expect(ev.description).not.toMatch(/^Description/);
        // Fees/Admission field: "WS Chamber Members: Included in membership,
        // FREE! General Admission: $10 per person" — general-admission wins.
        expect(ev.cost).toEqual({ min: 10 });
    });

    test("uses a venue-name-only location anchored to Seattle", () => {
        const results = parseDetailPage(readSample("sample-detail-name-only.html"), "men-s-therapy-group-09-29-2026-15027");
        expect(results).toHaveLength(1);
        const ev = results[0] as RipperCalendarEvent;
        expect(ev.summary).toBe("West Seattle Counseling: Men's Therapy Group");
        expect(ev.location).toBe("Counseling West Seattle, Seattle, WA");
        expect(ev.date.toLocalDateTime().toString()).toBe("2026-09-29T18:00");
        expect(ev.duration.toMinutes()).toBe(75);
    });

    test("parses the event image", () => {
        const results = parseDetailPage(readSample("sample-detail-image.html"), "feg-super-smash-saturday-09-26-2026-16348");
        const ev = results[0] as RipperCalendarEvent;
        expect(ev.summary).toBe("Fourth Emerald Games Super Smash Saturday");
        expect(ev.date.toLocalDateTime().toString()).toBe("2026-09-26T18:30");
        expect(ev.imageUrl).toMatch(/^https:\/\/chambermaster\.blob\.core\.windows\.net\//);
    });

    test("fills a known organizer's address when the page has no location", () => {
        const results = parseDetailPage(readSample("sample-detail-no-location.html"), "feg-pokémon-league-09-24-2026-16806");
        expect(results).toHaveLength(1);
        const ev = results[0] as RipperCalendarEvent;
        expect(ev.summary).toBe("Fourth Emerald Games Pokémon League");
        expect(ev.location).toBe("Fourth Emerald Games, 4517 California Ave SW, Seattle, WA 98116");
        // No Fees/Admission block on this fixture — stays a cost gap rather
        // than guessing.
        expect(ev.cost).toBeUndefined();
    });

    test("emits a location UncertaintyError when no location is published", () => {
        const html = readSample("sample-detail-no-location.html")
            .replace(/Fourth Emerald Games Pok&#233;mon League/g, "Neighborhood Mixer");
        const results = parseDetailPage(html, "neighborhood-mixer-09-24-2026-1");
        expect(results).toHaveLength(2);
        const ev = results[0] as RipperCalendarEvent;
        const unc = results[1] as UncertaintyError;
        expect(ev.summary).toBe("Neighborhood Mixer");
        expect(ev.location).toBe("West Seattle, Seattle, WA");
        expect(unc.type).toBe("Uncertainty");
        expect(unc.unknownFields).toEqual(["location"]);
        expect(unc.event.id).toBe(ev.id);
        expect(unc.source).toBe("west-seattle-chamber");
    });

    test("returns a ParseError for a page without a title", () => {
        const results = parseDetailPage("<html><body></body></html>", "x-1");
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ type: "ParseError" });
    });

    test("returns a ParseError for an unparseable start date", () => {
        const html = `<h1 class="gz-pagetitle">Thing</h1><span itemprop="startDate" content="soon"></span>`;
        const results = parseDetailPage(html, "x-1");
        expect(results[0]).toMatchObject({ type: "ParseError" });
    });
});

describe("parseFeesText", () => {
    test("prefers an explicitly labeled general-admission tier over a member rate (live example)", () => {
        expect(parseFeesText("WS Chamber Members: Included in membership, FREE! General Admission: $10 per person"))
            .toEqual({ min: 10 });
        expect(parseFeesText("WS Chamber Members: $25 General Admission: $35 Walk-In Rate: $35"))
            .toEqual({ min: 35 });
    });

    test("takes the first amount when multiple prices aren't member tiers (live example: session vs. package)", () => {
        expect(parseFeesText("$30/session.  4 sessions for $102 (use within 8 weeks)."))
            .toEqual({ min: 30 });
    });

    test("takes the higher amount when a member tier is present with no explicit general label", () => {
        expect(parseFeesText("Members $15 / Guests $25")).toEqual({ min: 25 });
    });

    test("a single stated price applies regardless of wording", () => {
        expect(parseFeesText("$20 per person")).toEqual({ min: 20 });
    });

    test("treats a bare free claim as free only when no dollar amount competes with it", () => {
        expect(parseFeesText("Free")).toEqual({ min: 0 });
        expect(parseFeesText("This event is free to attend.")).toEqual({ min: 0 });
    });

    test("recognizes NOTAFLOF / suggested-donation language as free", () => {
        expect(parseFeesText("Suggested donation $10-20, no one turned away.")).toEqual({ min: 0 });
        expect(parseFeesText("Donations are welcome but not required.")).toEqual({ min: 0 });
        // Live example: "Conscious Connections" (2026-09-24).
        expect(parseFeesText("Donation Based")).toEqual({ min: 0 });
    });

    test("treats the generic placeholder and empty text as no signal", () => {
        expect(parseFeesText("Varies from event to event")).toBeUndefined();
        expect(parseFeesText("N/A")).toBeUndefined();
        expect(parseFeesText("")).toBeUndefined();
        expect(parseFeesText(undefined)).toBeUndefined();
    });

    test("returns undefined when the field has text but no price or free signal", () => {
        expect(parseFeesText("Registration required, see website for details.")).toBeUndefined();
    });
});
