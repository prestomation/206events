import { describe, it, expect } from "vitest";
import { LocalDate, ZoneId, Duration } from "@js-joda/core";
import "@js-joda/timezone";
import LakeWashingtonBlvdBicycleWeekendsRipper from "./ripper.js";

const URL = "https://parkways.seattle.gov/2026/04/13/mayor-announces-bicycle-weekends-on-lake-washington-boulevard/";

describe("LakeWashingtonBlvdBicycleWeekendsRipper", () => {
    const zone = ZoneId.of("America/Los_Angeles");
    const ripper = new LakeWashingtonBlvdBicycleWeekendsRipper();

    it("generates 2026 schedule when run before the first weekend", () => {
        const events = ripper.generateEvents(zone, LocalDate.of(2026, 1, 1), URL);
        const calendarEvents = events.filter(e => "date" in e);

        expect(calendarEvents).toHaveLength(33);
    });

    it("excludes Aug 1-2 (Seafair)", () => {
        const events = ripper.generateEvents(zone, LocalDate.of(2026, 1, 1), URL);
        const calendarEvents = events.filter(e => "date" in e);

        const augDates = calendarEvents
            .map(e => "date" in e ? e.date.toLocalDate().toString() : "")
            .filter(s => s.startsWith("2026-08"));

        expect(augDates).not.toContain("2026-08-01");
        expect(augDates).not.toContain("2026-08-02");
        expect(augDates).toContain("2026-08-08");
    });

    it("includes holiday extension days", () => {
        const events = ripper.generateEvents(zone, LocalDate.of(2026, 1, 1), URL);
        const dates = events
            .filter(e => "date" in e)
            .map(e => "date" in e ? e.date.toLocalDate().toString() : "");

        // Memorial Day Monday
        expect(dates).toContain("2026-05-25");
        // Friday July 3
        expect(dates).toContain("2026-07-03");
        // Labor Day Monday
        expect(dates).toContain("2026-09-07");
    });

    it("filters out past dates", () => {
        const events = ripper.generateEvents(zone, LocalDate.of(2026, 8, 15), URL);
        const dates = events
            .filter(e => "date" in e)
            .map(e => "date" in e ? e.date.toLocalDate().toString() : "");

        expect(dates).not.toContain("2026-05-23");
        expect(dates).not.toContain("2026-08-09");
        expect(dates).toContain("2026-08-15");
        expect(dates).toContain("2026-09-07");
    });

    it("emits stable deterministic IDs", () => {
        const first = ripper.generateEvents(zone, LocalDate.of(2026, 1, 1), URL);
        const second = ripper.generateEvents(zone, LocalDate.of(2026, 1, 1), URL);

        const ids1 = first.filter(e => "id" in e).map(e => "id" in e ? e.id : "");
        const ids2 = second.filter(e => "id" in e).map(e => "id" in e ? e.id : "");

        expect(ids1).toEqual(ids2);
        expect(ids1[0]).toMatch(/^lake-wa-blvd-bicycle-weekend-\d{4}-\d{2}-\d{2}$/);
    });

    it("sets each event to 8am-8pm local time", () => {
        const events = ripper.generateEvents(zone, LocalDate.of(2026, 1, 1), URL);
        const calendarEvents = events.filter(e => "date" in e);

        for (const e of calendarEvents) {
            if (!("date" in e)) continue;
            expect(e.date.hour()).toBe(8);
            expect(e.date.minute()).toBe(0);
            expect(e.duration.equals(Duration.ofHours(12))).toBe(true);
        }
    });

    it("produces no parse errors", () => {
        const events = ripper.generateEvents(zone, LocalDate.of(2026, 1, 1), URL);
        const errors = events.filter(e => "type" in e);
        expect(errors).toHaveLength(0);
    });
});
