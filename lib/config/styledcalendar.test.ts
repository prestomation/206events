import { describe, it, expect, vi, afterEach } from "vitest";
import LZString from "lz-string";
import { ZoneId, ZoneRegion } from "@js-joda/core";
import "@js-joda/timezone";
import { StyledCalendarRipper } from "./styledcalendar.js";
import { Ripper, RipperConfig } from "./schema.js";

const TZ = ZoneId.of("America/Los_Angeles") as ZoneRegion;

// Build a minimal RipperConfig-like object for testing
function makeRipper(styledCalendarId: string): Ripper {
    return {
        config: {
            name: "test-venue",
            description: "Test Venue",
            url: new URL("https://example.com/events"),
            friendlyLink: "https://example.com",
            disabled: false,
            proxy: false,
            needsBrowser: false,
            expectEmpty: false,
            tags: ["Music"],
            geo: { lat: 47.6, lng: -122.3 },
            calendars: [
                {
                    name: "all-events",
                    friendlyname: "Test Venue Events",
                    timezone: TZ,
                    config: { styledCalendarId },
                },
            ],
        } as RipperConfig,
        ripperImpl: {} as StyledCalendarRipper,
    };
}

function makeApiResponse(events: object[]): string {
    const compressed = LZString.compressToUTF16(JSON.stringify(events));
    return JSON.stringify({
        compressedEventsAndIds: [
            {
                compressedEvents: compressed,
                sourceCalendarGoogleId: "test-google-id",
            },
        ],
    });
}

// Returns a date string N days from today, optionally with a time component.
// Using relative dates prevents test rot when hardcoded dates become past.
function futureDateStr(daysFromNow: number, time?: string, tzOffset = "-08:00"): string {
    const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    return time ? `${dateStr}T${time}${tzOffset}` : dateStr;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("StyledCalendarRipper", () => {
    describe("event mapping", () => {
        it("maps timed events correctly", async () => {
            const rawEvents = [
                {
                    id: "event-1",
                    title: "Live Music Night",
                    start: futureDateStr(30, "19:00:00", "-07:00"),
                    end: futureDateStr(30, "21:00:00", "-07:00"),
                    allDay: false,
                    timeZone: "America/Los_Angeles",
                    extendedProps: { description: "<p>A great show</p>" },
                },
            ];

            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => JSON.parse(makeApiResponse(rawEvents)),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));

            expect(calendars).toHaveLength(1);
            const cal = calendars[0];
            expect(cal.events).toHaveLength(1);
            expect(cal.errors).toHaveLength(0);

            const event = cal.events[0];
            expect(event.summary).toBe("Live Music Night");
            expect(event.description).toBe("<p>A great show</p>");
            expect(event.date.hour()).toBe(19);
            expect(event.date.minute()).toBe(0);
            // 2 hours duration
            expect(event.duration.toHours()).toBe(2);
        });

        it("maps all-day events correctly", async () => {
            // Use a fixed far-future date so we can assert on specific month/day values.
            // 2035-07-04 is Independence Day — won't rot for a decade.
            const rawEvents = [
                {
                    id: "event-2",
                    title: "Community Day",
                    start: "2035-07-04",
                    end: "2035-07-04",
                    allDay: true,
                    timeZone: "America/Los_Angeles",
                },
            ];

            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => JSON.parse(makeApiResponse(rawEvents)),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));

            const cal = calendars[0];
            expect(cal.events).toHaveLength(1);
            const event = cal.events[0];
            expect(event.summary).toBe("Community Day");
            expect(event.date.monthValue()).toBe(7);
            expect(event.date.dayOfMonth()).toBe(4);
        });

        it("uses 2-hour default duration when no end time for timed event", async () => {
            const rawEvents = [
                {
                    id: "event-3",
                    title: "Open Mic",
                    start: futureDateStr(30, "20:00:00", "-07:00"),
                    allDay: false,
                },
            ];

            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => JSON.parse(makeApiResponse(rawEvents)),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            const cal = calendars[0];
            expect(cal.events).toHaveLength(1);
            expect(cal.events[0].duration.toHours()).toBe(2);
        });
    });

    describe("filtering", () => {
        it("filters out past events", async () => {
            const rawEvents = [
                {
                    id: "past-event",
                    title: "Old Show",
                    start: "2020-01-01T19:00:00-08:00",
                    end: "2020-01-01T21:00:00-08:00",
                    allDay: false,
                },
                {
                    id: "future-event",
                    title: "Future Show",
                    start: futureDateStr(90, "19:00:00"),
                    end: futureDateStr(90, "21:00:00"),
                    allDay: false,
                },
            ];

            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => JSON.parse(makeApiResponse(rawEvents)),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            const cal = calendars[0];
            expect(cal.events).toHaveLength(1);
            expect(cal.events[0].summary).toBe("Future Show");
        });

        it("filters out CLOSED entries", async () => {
            const rawEvents = [
                {
                    id: "closed-1",
                    title: "CLOSED",
                    start: futureDateStr(30, "00:00:00"),
                    end: futureDateStr(30, "23:59:00"),
                    allDay: false,
                },
                {
                    id: "closed-2",
                    title: "CAFE CLOSED",
                    start: futureDateStr(31, "00:00:00"),
                    end: futureDateStr(31, "23:59:00"),
                    allDay: false,
                },
                {
                    id: "real-event",
                    title: "Open Mic Night",
                    start: futureDateStr(32, "19:00:00"),
                    end: futureDateStr(32, "22:00:00"),
                    allDay: false,
                },
            ];

            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => JSON.parse(makeApiResponse(rawEvents)),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            const cal = calendars[0];
            expect(cal.events).toHaveLength(1);
            expect(cal.events[0].summary).toBe("Open Mic Night");
        });

        it("filters CLOSED case-insensitively", async () => {
            const rawEvents = [
                {
                    id: "closed-lower",
                    title: "cafe closed for private event",
                    start: futureDateStr(30, "10:00:00"),
                    end: futureDateStr(30, "20:00:00"),
                    allDay: false,
                },
            ];

            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => JSON.parse(makeApiResponse(rawEvents)),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            expect(calendars[0].events).toHaveLength(0);
        });
    });

    describe("error handling", () => {
        it("returns ParseError when API fetch fails", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            expect(calendars).toHaveLength(1);
            expect(calendars[0].events).toHaveLength(0);
            expect(calendars[0].errors).toHaveLength(1);
            expect(calendars[0].errors[0].type).toBe("ParseError");
            expect(calendars[0].errors[0].reason).toContain("Network error");
        });

        it("returns ParseError when API returns non-OK status", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: "Not Found",
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            expect(calendars[0].errors[0].reason).toContain("404");
        });

        it("returns ParseError when styledCalendarId is missing", async () => {
            const ripper = new StyledCalendarRipper();
            const ripperObj: Ripper = {
                ...makeRipper("test-id"),
                config: {
                    ...makeRipper("test-id").config,
                    calendars: [
                        {
                            name: "all-events",
                            friendlyname: "Test",
                            timezone: TZ,
                            // no config
                        },
                    ],
                },
            };

            const calendars = await ripper.rip(ripperObj);
            expect(calendars[0].errors).toHaveLength(1);
            expect(calendars[0].errors[0].reason).toContain("styledCalendarId");
        });

        it("returns ParseError for invalid compressed data", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    compressedEventsAndIds: [
                        {
                            compressedEvents: "not-valid-lzstring-data",
                            sourceCalendarGoogleId: "test",
                        },
                    ],
                }),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            // Invalid LZ-string returns null from decompressFromUTF16
            // We expect a ParseError
            expect(calendars[0].errors.length).toBeGreaterThan(0);
        });

        it("returns empty events array (not null) when no events exist", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ compressedEventsAndIds: [] }),
            }));

            const ripper = new StyledCalendarRipper();
            const calendars = await ripper.rip(makeRipper("test-id"));
            expect(calendars[0].events).toEqual([]);
            expect(Array.isArray(calendars[0].events)).toBe(true);
        });
    });

    describe("LZ-String decompression", () => {
        it("correctly decompresses and parses event arrays", async () => {
            const events = [
                { id: "a", title: "Test Event", start: futureDateStr(90, "18:00:00", "-07:00"), end: futureDateStr(90, "20:00:00", "-07:00"), allDay: false },
            ];
            const compressed = LZString.compressToUTF16(JSON.stringify(events));
            const decompressed = LZString.decompressFromUTF16(compressed);
            expect(decompressed).not.toBeNull();
            const parsed = JSON.parse(decompressed!);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].title).toBe("Test Event");
        });
    });
});
