import { describe, expect, test, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZonedDateTime, ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import FremontChamberOfCommerceRipper, { extractDetailSlugs, parseEventIcs } from "./ripper.js";
import { RipperCalendarEvent, UncertaintyError } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of("America/Los_Angeles");

function readSample(name: string): string {
    return fs.readFileSync(path.join(__dirname, name), "utf-8");
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: "fremont-chamber-of-commerce",
            url: new URL("https://business.fremont.com/calendar"),
            tags: ["Community", "Fremont"],
            geo: null,
            disabled: false,
            proxy: false,
            calendars: [{
                name: "fremont-chamber-of-commerce",
                friendlyname: "Fremont Chamber of Commerce",
                timezone: TIMEZONE,
            }],
            ...overrides,
        },
    } as any;
}

describe("extractDetailSlugs", () => {
    test("extracts unique event slugs from the listing page", () => {
        const html = readSample("sample-data.html");
        const slugs = extractDetailSlugs(html);
        expect(slugs.sort()).toEqual([
            "apda-nw-optimism-walk-1867802",
            "fremont-health-and-wellness-meet-up-1870771",
            "fremont-health-and-wellness-meet-up-1870819",
        ].sort());
    });

    test("dedupes a slug linked more than once (title link + card-header link)", () => {
        const html = `
            <a href="https://business.fremont.com/calendar/Details/repeat-event-123?sourceTypeId=Website">link</a>
            <a href="https://business.fremont.com/calendar/Details/repeat-event-123?sourceTypeId=Website">title</a>
        `;
        expect(extractDetailSlugs(html)).toEqual(["repeat-event-123"]);
    });

    test("returns an empty array when there are no event links", () => {
        expect(extractDetailSlugs("<p>No upcoming events found.</p>")).toEqual([]);
    });
});

describe("parseEventIcs", () => {
    test("parses a normal event with a full location", () => {
        const ics = readSample("sample-event.ics");
        const results = parseEventIcs(ics, "fremont-health-and-wellness-meet-up-1870771");

        expect(results).toHaveLength(1);
        const event = results[0] as RipperCalendarEvent;
        expect(event.id).toBe("fremont-health-and-wellness-meet-up-1870771");
        expect(event.summary).toBe("Fremont Health and Wellness Meet Up");
        expect(event.location).toBe("St. James Tower, 920 N 34th St, #200 Seattle WA 98103");
        expect(event.url).toBe("https://business.fremont.com/calendar/Details/fremont-health-and-wellness-meet-up-1870771");

        // DTSTART;TZID=America/Los_Angeles:20260825T173000 / DTEND ...T183000
        const start = event.date;
        expect(start.year()).toBe(2026);
        expect(start.monthValue()).toBe(8);
        expect(start.dayOfMonth()).toBe(25);
        expect(start.hour()).toBe(17);
        expect(start.minute()).toBe(30);
        expect(start.zone().toString()).toBe("America/Los_Angeles");
        expect(event.duration.toMinutes()).toBe(60);
        expect(event.description).toContain("networking");
    });

    test("emits an event with a placeholder location plus an UncertaintyError when ICS LOCATION is blank", () => {
        const ics = readSample("sample-event-no-location.ics");
        const results = parseEventIcs(ics, "apda-nw-optimism-walk-1867802");

        expect(results).toHaveLength(2);
        const event = results[0] as RipperCalendarEvent;
        expect(event.summary).toBe("APDA NW Optimism Walk");
        expect(event.location).toBe("Fremont, Seattle, WA");

        const uncertainty = results[1] as UncertaintyError;
        expect(uncertainty.type).toBe("Uncertainty");
        expect(uncertainty.unknownFields).toEqual(["location"]);
        expect(uncertainty.event.id).toBe(event.id);
        expect(uncertainty.source).toBe("fremont-chamber-of-commerce");
        expect(uncertainty.partialFingerprint).toBeTruthy();

        // DTSTART 09:30, DTEND 14:00 → 4.5h duration
        expect(event.duration.toMinutes()).toBe(270);
    });

    test("returns a ParseError when the ICS has no VEVENT", () => {
        const ics = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
        const results = parseEventIcs(ics, "empty-event");
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe("ParseError");
    });

    test("returns a ParseError when the ICS fails to parse entirely", () => {
        const results = parseEventIcs("not an ics file at all", "malformed-event");
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe("ParseError");
    });

    test("returns a ParseError when VEVENT has no SUMMARY", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "DTSTART;TZID=America/Los_Angeles:20260825T173000",
            "DTEND;TZID=America/Los_Angeles:20260825T183000",
            "UID:e.no-summary",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");
        const results = parseEventIcs(ics, "no-summary-event");
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe("ParseError");
    });

    test("falls back to a default duration when DTEND is missing", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "DTSTART;TZID=America/Los_Angeles:20260825T173000",
            "SUMMARY:No End Time Event",
            "LOCATION:Some Place",
            "UID:e.no-end",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");
        const results = parseEventIcs(ics, "no-end-event");
        expect(results).toHaveLength(1);
        const event = results[0] as RipperCalendarEvent;
        expect(event.duration.toMinutes()).toBe(60);
    });

    test("accepts a floating (no-TZID) DTSTART as wall-clock local time", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "DTSTART:20260825T173000",
            "SUMMARY:Floating Time Event",
            "LOCATION:Some Place",
            "UID:e.floating",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");
        const results = parseEventIcs(ics, "floating-event");
        expect(results).toHaveLength(1);
        const event = results[0] as RipperCalendarEvent;
        expect(event.date.hour()).toBe(17);
        expect(event.date.zone().toString()).toBe("America/Los_Angeles");
    });

    test("returns a ParseError when DTSTART is a UTC (Z-suffixed) timestamp rather than the expected zone", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "DTSTART:20260825T173000Z",
            "SUMMARY:UTC Event",
            "LOCATION:Some Place",
            "UID:e.utc",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");
        const results = parseEventIcs(ics, "utc-event");
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe("ParseError");
        expect((results[0] as { reason: string }).reason).toContain("unexpected timezone");
    });

    test("returns a ParseError when DTEND is in an unexpected timezone", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "DTSTART;TZID=America/Los_Angeles:20260825T173000",
            "DTEND:20260825T183000Z",
            "SUMMARY:Mixed Timezone Event",
            "LOCATION:Some Place",
            "UID:e.mixed-tz",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n");
        const results = parseEventIcs(ics, "mixed-tz-event");
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe("ParseError");
        expect((results[0] as { reason: string }).reason).toContain("DTEND");
    });
});

describe("FremontChamberOfCommerceRipper.rip", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("fetches the listing, resolves each event's ICS, and drops past events", async () => {
        const listingHtml = readSample("sample-data.html");
        const icsWithLocation = readSample("sample-event.ics");
        const icsNoLocation = readSample("sample-event-no-location.ics");

        const calledUrls: string[] = [];
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            calledUrls.push(url);
            if (url === "https://business.fremont.com/calendar") {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(listingHtml) });
            }
            if (url.endsWith("fremont-health-and-wellness-meet-up-1870771.ics")) {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(icsWithLocation) });
            }
            if (url.endsWith("apda-nw-optimism-walk-1867802.ics")) {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(icsNoLocation) });
            }
            // fremont-health-and-wellness-meet-up-1870819: simulate an HTTP failure
            // to exercise per-event fetch-error isolation.
            return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("") });
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new FremontChamberOfCommerceRipper();
        const result = await ripper.rip(makeRipper());

        expect(result).toHaveLength(1);
        expect(calledUrls[0]).toBe("https://business.fremont.com/calendar");
        expect(calledUrls).toHaveLength(4); // listing + 3 event ICS fetches

        const { events, errors } = result[0];

        // All fixture dates are in the future relative to real "now" at the
        // time these fixtures were captured (2026); assert the isBefore(now)
        // filter didn't drop everything, and nothing landed in the past.
        const now = ZonedDateTime.now(TIMEZONE);
        for (const event of events) {
            expect(event.date.isBefore(now)).toBe(false);
        }

        const summaries = events.map(e => e.summary).sort();
        expect(summaries).toEqual(["APDA NW Optimism Walk", "Fremont Health and Wellness Meet Up"]);

        // The blank-location event still produced an event + Uncertainty pair.
        const walk = events.find(e => e.summary === "APDA NW Optimism Walk");
        expect(walk?.location).toBe("Fremont, Seattle, WA");
        const uncertaintyErrors = errors.filter(e => e.type === "Uncertainty");
        expect(uncertaintyErrors).toHaveLength(1);

        // The simulated HTTP 500 for the third event surfaced as a ParseError,
        // not a crash, and didn't discard the other two events.
        const parseErrors = errors.filter(e => e.type === "ParseError");
        expect(parseErrors).toHaveLength(1);
        expect(parseErrors[0].reason).toContain("HTTP 500");
    });

    test("throws when the listing page fetch fails", async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve("") });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new FremontChamberOfCommerceRipper();
        await expect(ripper.rip(makeRipper())).rejects.toThrow(/503/);
    });

    test("throws when no calendars are configured", async () => {
        const ripper = new FremontChamberOfCommerceRipper();
        await expect(ripper.rip(makeRipper({ calendars: [] }))).rejects.toThrow(/No calendars configured/);
    });
});
