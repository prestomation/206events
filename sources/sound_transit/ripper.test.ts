import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseDate, parseTime } from "./ripper.js";
import { LocalDate, ZoneId } from "@js-joda/core";
import SoundTransitRipper from "./ripper.js";

const TZ = ZoneId.of("America/Los_Angeles");

const sampleData = JSON.parse(
    readFileSync(join(__dirname, "sample-data.json"), "utf-8")
);

describe("parseTime", () => {
    it("parses afternoon time with minutes", () => {
        expect(parseTime("1:30 p.m.")?.toString()).toBe("13:30");
    });
    it("parses morning time", () => {
        expect(parseTime("9:00 a.m.")?.toString()).toBe("09:00");
    });
    it("parses noon", () => {
        expect(parseTime("12:00 p.m.")?.toString()).toBe("12:00");
    });
    it("parses midnight edge", () => {
        expect(parseTime("12:00 a.m.")?.toString()).toBe("00:00");
    });
    it("returns null for unparseable string", () => {
        expect(parseTime("TBD")).toBeNull();
    });
});

describe("parseDate", () => {
    it("parses full date", () => {
        expect(parseDate("June 11, 2026")).toEqual(LocalDate.of(2026, 6, 11));
    });
    it("parses December date", () => {
        expect(parseDate("December 31, 2026")).toEqual(LocalDate.of(2026, 12, 31));
    });
    it("returns null for invalid input", () => {
        expect(parseDate("bad date")).toBeNull();
    });
});

describe("SoundTransitRipper", () => {
    const ripper = new SoundTransitRipper();

    it("parses a sample event correctly", () => {
        const ev = {
            days_type: "single" as const,
            title: "Board of Directors Meeting ",
            body: "The Board establishes policies…",
            start_date: "June 25, 2026",
            end_date: "June 25, 2026",
            start_time: "1:30 p.m.",
            end_time: "4:00 p.m.",
            url: "/get-to-know-us/news-events/calendar/board-directors-meeting-2026-06-25",
            event_cancelled: "0",
            id: "182342",
        };
        const result = ripper.parseEvent(ev, TZ);
        expect("date" in result).toBe(true);
        if ("date" in result) {
            expect(result.summary).toBe("Board of Directors Meeting");
            expect(result.id).toBe("sound-transit-182342");
            expect(result.date.hour()).toBe(13);
            expect(result.date.minute()).toBe(30);
            expect(result.duration.toMinutes()).toBe(150);
            expect(result.url).toBe("https://www.soundtransit.org/get-to-know-us/news-events/calendar/board-directors-meeting-2026-06-25");
        }
    });

    it("returns ParseError on unparseable date", () => {
        const ev = {
            days_type: "single" as const,
            title: "Bad Event",
            body: "",
            start_date: "not-a-date",
            end_date: "not-a-date",
            start_time: "10:00 a.m.",
            end_time: "11:00 a.m.",
            url: "/bad",
            event_cancelled: "0",
            id: "0",
        };
        const result = ripper.parseEvent(ev, TZ);
        expect("type" in result && result.type === "ParseError").toBe(true);
    });

    it("defaults to 2-hour duration when end_time is unparseable", () => {
        const ev = {
            days_type: "single" as const,
            title: "Event Without End Time",
            body: "",
            start_date: "July 10, 2026",
            end_date: "July 10, 2026",
            start_time: "6:00 p.m.",
            end_time: "TBD",
            url: "/event",
            event_cancelled: "0",
            id: "111",
        };
        const result = ripper.parseEvent(ev, TZ);
        expect("date" in result).toBe(true);
        if ("date" in result) {
            expect(result.duration.toHours()).toBe(2);
        }
    });

    it("parses all events from sample data without errors", () => {
        let eventsCount = 0;
        let errorsCount = 0;
        const groups = sampleData.groups as any;
        for (const month of Object.values(groups) as any[]) {
            for (const day of Object.values(month.rows) as any[]) {
                for (const typeGroup of Object.values(day.rows) as any[]) {
                    for (const ev of typeGroup.rows as any[]) {
                        const result = ripper.parseEvent(ev, TZ);
                        if ("date" in result) eventsCount++;
                        else errorsCount++;
                    }
                }
            }
        }
        expect(eventsCount).toBeGreaterThan(10);
        expect(errorsCount).toBe(0);
    });
});
