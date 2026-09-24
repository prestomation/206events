import { describe, it, expect } from "vitest";
import { DayOfWeek, LocalDate, LocalTime, ZoneId } from "@js-joda/core";
import '@js-joda/timezone';
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
    ActiveNetBundle, ActivityItem, MeetingDates,
    isCommunityDropIn, isPublicSpecialEvent, parseClock, parseCost, parseDropIns,
    parseExceptionDates, parseSpecialEvents, parseTimeRange, parseWeekdays, parseWeeksOfMonth,
    resolveLocation, cleanText,
} from "./ripper.js";
import { RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundle: ActiveNetBundle = JSON.parse(readFileSync(join(__dirname, "sample-data.json"), "utf-8"));
const zone = ZoneId.of("America/Los_Angeles");
const today = LocalDate.of(2026, 9, 23);

const events = (r: RipperEvent[]) => r.filter((e): e is RipperCalendarEvent => "date" in e);
const errors = (r: RipperEvent[]) => r.filter((e): e is RipperError => "type" in e);

describe("time parsing", () => {
    it("parses clock strings including Noon/Midnight", () => {
        expect(parseClock("10:00 AM")?.toString()).toBe("10:00");
        expect(parseClock("12:30 PM")?.toString()).toBe("12:30");
        expect(parseClock("12:00 AM")?.toString()).toBe("00:00");
        expect(parseClock("Noon")?.toString()).toBe("12:00");
        expect(parseClock("Midnight")?.toString()).toBe("00:00");
        expect(parseClock("25:00 PM")).toBeNull();
    });

    it("parses time ranges", () => {
        const r = parseTimeRange("10:00 AM - Noon")!;
        expect(r.start.toString()).toBe("10:00");
        expect(r.end.toString()).toBe("12:00");
        expect(parseTimeRange("")).toBeNull();
        expect(parseTimeRange("TBD")).toBeNull();
    });

    it("parses grouped exception dates", () => {
        expect(parseExceptionDates("27 Oct 2026")?.map(String)).toEqual(["2026-10-27"]);
        expect(parseExceptionDates("11,26,27 Nov 2026")?.map(String)).toEqual(["2026-11-11", "2026-11-26", "2026-11-27"]);
        expect(parseExceptionDates("Oct 27")).toBeNull();
    });

    it("parses weekday tokens", () => {
        expect(parseWeekdays("Tue")).toEqual([DayOfWeek.TUESDAY]);
        expect(parseWeekdays("Mon,Wed")).toEqual([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]);
        expect(parseWeekdays("Weekdays")?.length).toBe(5);
        expect(parseWeekdays("Fri-Sun")).toEqual([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]);
        expect(parseWeekdays("Someday")).toBeNull();
    });

    it("parses weeks_of_month", () => {
        expect(parseWeeksOfMonth("")).toBe("all");
        expect([...(parseWeeksOfMonth("2nd, 4th week of every month") as Set<number>)]).toEqual([2, 4]);
        expect([...(parseWeeksOfMonth("Last week of every month") as Set<number>)]).toEqual([-1]);
        expect(parseWeeksOfMonth("every other week")).toBeNull();
    });
});

describe("filters", () => {
    const base: ActivityItem = { id: 1, name: "", only_one_day: true, date_range_start: "2026-10-01", location: { label: "Garfield Cmty Ctr" } };

    it("keeps public one-day special events and drops trips/childcare/closed programs", () => {
        expect(isPublicSpecialEvent({ ...base, name: "Happy Haunts Carnival" })).toBe(true);
        expect(isPublicSpecialEvent({ ...base, name: "Field Trip: WA State Fair" })).toBe(false);
        expect(isPublicSpecialEvent({ ...base, name: "Transportation to Magnuson Fair" })).toBe(false);
        expect(isPublicSpecialEvent({ ...base, name: "Wonderful Wednesdays (Parents Night)" })).toBe(false);
        expect(isPublicSpecialEvent({ ...base, name: "Specialized Programs Teen Social #1" })).toBe(false);
        expect(isPublicSpecialEvent({ ...base, name: "Bingo Day", only_one_day: false })).toBe(false);
        expect(isPublicSpecialEvent({ ...base, name: "Bingo Day", location: { label: "N/A" } })).toBe(false);
    });

    it("keeps community drop-ins and drops facility schedules", () => {
        expect(isCommunityDropIn({ ...base, name: "Drop-In: Mahjong" })).toBe(true);
        expect(isCommunityDropIn({ ...base, name: "Drop-In: Board Game Buffet" })).toBe(true);
        expect(isCommunityDropIn({ ...base, name: "Lap Swim - Drop In" })).toBe(false);
        expect(isCommunityDropIn({ ...base, name: "Drop-In: Outdoor Pickleball- Miller Courts" })).toBe(false);
        expect(isCommunityDropIn({ ...base, name: "Drop-In: Tot Room" })).toBe(false);
        expect(isCommunityDropIn({ ...base, name: "Drop-In: Teen Room" })).toBe(false);
    });
});

describe("helpers", () => {
    it("parses fee labels", () => {
        expect(parseCost("Free")).toEqual({ min: 0 });
        expect(parseCost("$15.00")).toEqual({ min: 15 });
        expect(parseCost("View fee details")).toEqual({ paid: true });
        expect(parseCost("View Registration Info")).toEqual({ min: 0 });
    });

    it("resolves locations from center detail, else description/label", () => {
        const loc = resolveLocation("Japanese Gardn", bundle.locations);
        expect(loc.location).toContain("1075 Lake Washington");
        expect(loc.lat).toBeCloseTo(47.63, 1);
        expect(resolveLocation("N/A", bundle.locations)).toEqual({});
        expect(resolveLocation("Somewhere Else", {}).location).toBe("Somewhere Else, Seattle, WA");
    });

    it("strips HTML from descriptions", () => {
        expect(cleanText("Not a lesson. <div><br> <div><br></div></div>")).toBe("Not a lesson.");
        expect(cleanText("Arts &amp; Crafts")).toBe("Arts & Crafts");
    });
});

describe("parseSpecialEvents (sample data)", () => {
    const result = parseSpecialEvents(bundle.specialItems, bundle.locations, zone, today);
    const evs = events(result);

    it("produces events with no parse errors", () => {
        expect(evs.length).toBeGreaterThan(10);
        expect(errors(result)).toEqual([]);
    });

    it("excludes field trips and past events", () => {
        expect(evs.some(e => /^Field Trip/i.test(e.summary))).toBe(false);
        for (const e of evs) expect(e.date.toLocalDate().isBefore(today)).toBe(false);
    });

    it("maps a tea ceremony to the Japanese Garden with a stable id and cost", () => {
        const tea = evs.find(e => e.summary.startsWith("Tea Ceremony") && e.date.toLocalDate().toString() === "2026-09-27" && e.date.hour() === 13)!;
        expect(tea).toBeDefined();
        expect(tea.id).toBe("sprac-89538-2026-09-27");
        expect(tea.location).toContain("Japanese Garden, 1075 Lake Washington BLVD E");
        expect(tea.duration.toMinutes()).toBe(40);
        expect(tea.cost).toEqual({ min: 15 });
        expect(tea.url).toMatch(/^https:\/\/.*activecommunities\.com\/seattle\//);
    });

    it("ids are unique", () => {
        expect(new Set(evs.map(e => e.id)).size).toBe(evs.length);
    });
});

describe("parseDropIns (sample data)", () => {
    const result = parseDropIns(bundle.dropInItems, bundle.meetings, bundle.locations, zone, today);
    const evs = events(result);

    it("expands meeting patterns with no parse errors", () => {
        expect(evs.length).toBeGreaterThan(50);
        expect(errors(result)).toEqual([]);
        expect(new Set(evs.map(e => e.id)).size).toBe(evs.length);
    });

    it("excludes facility schedules", () => {
        expect(evs.some(e => /swim|pickleball/i.test(e.summary))).toBe(false);
    });

    it("respects the horizon", () => {
        const horizon = today.plusDays(60);
        for (const e of evs) {
            const d = e.date.toLocalDate();
            expect(d.isBefore(today)).toBe(false);
            expect(d.isAfter(horizon)).toBe(false);
        }
    });

    it("honors exception dates (Laurelhurst MahJong has no session Oct 27)", () => {
        const mj = evs.filter(e => e.id!.startsWith("sprac-86802-"));
        expect(mj.length).toBeGreaterThan(4);
        expect(mj.some(e => e.date.toLocalDate().toString() === "2026-10-27")).toBe(false);
        expect(mj.some(e => e.date.toLocalDate().toString() === "2026-10-20")).toBe(true);
        for (const e of mj) {
            expect(e.date.dayOfWeek()).toEqual(DayOfWeek.TUESDAY);
            expect(e.date.toLocalTime().equals(LocalTime.of(11, 0))).toBe(true);
            expect(e.location).toContain("4554 NE 41st ST");
        }
    });
});

describe("parseDropIns (synthetic patterns)", () => {
    const item: ActivityItem = { id: 42, name: "Drop-In: Poetry", only_one_day: false, date_range_start: "2026-09-01", location: { label: "X" } };
    const mk = (weeks: string, weekdays = "Fri", exc: string[] = []): Record<string, MeetingDates> => ({
        "42": { activity_patterns: [{ beginning_date: "2026-09-01", ending_date: "2026-12-31", weeks_of_month: weeks, exception_dates: exc, pattern_dates: [{ weekdays, starting_time: "18:00:00", ending_time: "19:30:00" }] }] },
    });

    it("selects nth weekdays of the month", () => {
        const evs = events(parseDropIns([item], mk("1st week of every month"), {}, zone, today));
        expect(evs.map(e => e.date.toLocalDate().toString())).toEqual(["2026-10-02", "2026-11-06"]);
        expect(evs[0].duration.toMinutes()).toBe(90);
    });

    it("selects the last weekday of the month", () => {
        const evs = events(parseDropIns([item], mk("Last week of every month"), {}, zone, today));
        expect(evs.map(e => e.date.toLocalDate().toString())).toEqual(["2026-09-25", "2026-10-30"]);
    });

    it("reports unknown patterns as ParseErrors instead of dropping them", () => {
        const r = parseDropIns([item], mk("every other week"), {}, zone, today);
        expect(events(r)).toEqual([]);
        expect(errors(r).length).toBe(1);
        const missing = parseDropIns([item], {}, {}, zone, today);
        expect(errors(missing)[0].reason).toContain("No meeting dates");
    });
});
