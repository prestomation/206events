import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import { parseIcsEvents, isNoiseTitle } from "./ripper.js";
import { RipperCalendarEvent } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of("America/Los_Angeles");

function readSample(): string {
    return fs.readFileSync(path.join(__dirname, "sample-data.ics"), "utf-8");
}

describe("isNoiseTitle", () => {
    test.each([
        "OPEN 11AM-8PM",
        "OPEN 5PM-8PM",
        "CLOSED",
        "Birthday Reservation: CLOSED",
        "REGIONAL: Nice",
        "REGIONAL: Buenos Aires SPE",
        "@ Card Party Dallas",
    ])("flags %s as noise", (title) => {
        expect(isNoiseTitle(title)).toBe(true);
    });

    test.each([
        "WEEKLIES: Pokemon TCG Standard Tournament",
        "EVENT: GUNDAM CARD GAME 1st Anniversary Event",
        "Tabletop Village TRADE NIGHT!",
        "POKÉMON League/Family Day",
    ])("does not flag %s as noise", (title) => {
        expect(isNoiseTitle(title)).toBe(false);
    });
});

describe("parseIcsEvents", () => {
    const now = ZonedDateTime.of(2026, 1, 1, 0, 0, 0, 0, TIMEZONE);
    const results = parseIcsEvents(readSample(), now);
    const events = results.filter((r): r is RipperCalendarEvent => "date" in r);
    const errors = results.filter(r => !("date" in r));

    test("produces no errors on well-formed input", () => {
        expect(errors).toEqual([]);
    });

    test("expands the recurring weekly series within the RRULE's UNTIL, skipping the EXDATE", () => {
        const series = events.filter(e => e.id?.startsWith("weekly-test-tournament@tabletopvillage.com-"));
        const dates = series.map(e => e.date.toLocalDate().toString()).sort();
        // Every Saturday Jan 3 - Jan 31 2026 except Jan 17 (EXDATE).
        expect(dates).toEqual(["2026-01-03", "2026-01-10", "2026-01-24", "2026-01-31"]);
    });

    test("applies the RECURRENCE-ID override's summary, time, and description to its occurrence", () => {
        const overridden = events.find(e => e.id === "weekly-test-tournament@tabletopvillage.com-2026-01-10");
        expect(overridden).toBeDefined();
        expect(overridden!.summary).toBe("WEEKLIES: Test Tournament (Charity Special)");
        expect(overridden!.date.hour()).toBe(19);
        expect(overridden!.description).toContain("charity edition");
    });

    test("leaves the non-overridden occurrences at the master's time and summary", () => {
        const normal = events.find(e => e.id === "weekly-test-tournament@tabletopvillage.com-2026-01-03");
        expect(normal).toBeDefined();
        expect(normal!.summary).toBe("WEEKLIES: Test Tournament");
        expect(normal!.date.hour()).toBe(18);
    });

    test("includes a one-off event with its own location", () => {
        const releaseParty = events.find(e => e.summary === "EVENT: Test Release Party");
        expect(releaseParty).toBeDefined();
        expect(releaseParty!.location).toBe("616 8th Ave S, Seattle, WA 98104");
    });

    test("falls back to the venue address when an event has no LOCATION", () => {
        const normal = events.find(e => e.id === "weekly-test-tournament@tabletopvillage.com-2026-01-03");
        expect(normal!.location).toBe("616 8th Ave S, Seattle, WA 98104");
    });

    test("drops an already-past one-off event", () => {
        expect(events.some(e => e.summary === "EVENT: Already Past")).toBe(false);
    });

    test("drops a one-off event beyond the 6-month lookahead horizon", () => {
        expect(events.some(e => e.summary === "EVENT: Too Far Future")).toBe(false);
    });

    test("filters out posted store-hours noise ('OPEN ...')", () => {
        expect(events.some(e => e.summary.startsWith("OPEN"))).toBe(false);
    });

    test("filters out out-of-town regional-championship reference dates", () => {
        expect(events.some(e => e.summary.startsWith("REGIONAL:"))).toBe(false);
    });

    test("produces exactly the expected non-noise events", () => {
        expect(events.map(e => e.summary).sort()).toEqual([
            "EVENT: Test Release Party",
            "WEEKLIES: Test Tournament",
            "WEEKLIES: Test Tournament",
            "WEEKLIES: Test Tournament",
            "WEEKLIES: Test Tournament (Charity Special)",
        ].sort());
    });

    test("returns a ParseError, not a throw, for unparseable ICS content", () => {
        const broken = parseIcsEvents("not a valid calendar", now);
        expect(broken.length).toBeGreaterThan(0);
        expect(broken.every(r => !("date" in r))).toBe(true);
    });
});
