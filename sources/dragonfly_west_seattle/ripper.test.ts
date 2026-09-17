import { describe, expect, test, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZoneId } from "@js-joda/core";
import "@js-joda/timezone";
import DragonflyWestSeattleRipper, {
    buildRecurringEvents,
    costFromSession,
    parseOneOffSession,
    slugify,
    MomenceSession,
} from "./ripper.js";
import { RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEZONE = ZoneId.of("America/Los_Angeles");

function loadSample(): MomenceSession[] {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-data.json"), "utf-8"));
    return raw.payload;
}

function makeRipper(overrides: Record<string, any> = {}) {
    return {
        config: {
            name: "dragonfly-west-seattle",
            url: new URL("https://www.dragonflywestseattle.com/"),
            tags: ["Dance", "Wellness", "West Seattle"],
            geo: { lat: 47.573696, lng: -122.38657, label: "Dragonfly Yoga Pilates Dance, 3270 California Ave SW, Seattle, WA 98116" },
            sourceRole: "venue",
            disabled: false,
            proxy: false,
            calendars: [{
                name: "dragonfly-west-seattle",
                friendlyname: "Dragonfly Yoga Pilates Dance",
                timezone: TIMEZONE,
            }],
            ...overrides,
        },
    } as any;
}

const ONE_OFF: MomenceSession = {
    id: 142505784,
    sessionName: "September SoundBath",
    level: "Join Daniella for a SoundBath and release stress.",
    type: "special-event-new",
    image: "https://images.momence.com/h/40118/session-banner/example.jpg",
    startsAt: "2026-09-21T02:00:00.000Z",
    durationMinutes: 60,
    link: "https://momence.com/s/142505784",
    teacher: "Daniella White",
    fixedTicketPrice: 40,
    dynamicTicketPriceMin: null,
    freeEvent: false,
    isCancelled: false,
};

const FREE_ONE_OFF: MomenceSession = {
    ...ONE_OFF,
    id: 999001,
    sessionName: "Community Open House",
    freeEvent: true,
    fixedTicketPrice: null,
};

describe("slugify", () => {
    test("lowercases and hyphenates", () => {
        expect(slugify("Vinyasa Flow & Restore")).toBe("vinyasa-flow-restore");
    });
});

describe("costFromSession", () => {
    test("free events cost {min: 0}", () => {
        expect(costFromSession(FREE_ONE_OFF)).toEqual({ min: 0 });
    });

    test("a fixed ticket price becomes the min", () => {
        expect(costFromSession(ONE_OFF)).toEqual({ min: 40 });
    });

    test("a dynamic price min is used when there's no fixed price", () => {
        const s = { ...ONE_OFF, fixedTicketPrice: null, dynamicTicketPriceMin: 15 };
        expect(costFromSession(s)).toEqual({ min: 15 });
    });

    test("falls back to paid:true when no price is given at all", () => {
        const s = { ...ONE_OFF, fixedTicketPrice: null, dynamicTicketPriceMin: null, freeEvent: false };
        expect(costFromSession(s)).toEqual({ paid: true });
    });

    test("treats an explicit $0 fixed price as free, not paid:true", () => {
        const s = { ...ONE_OFF, fixedTicketPrice: 0, freeEvent: false };
        expect(costFromSession(s)).toEqual({ min: 0 });
    });

    test("treats an explicit $0 dynamic price min as free, not paid:true", () => {
        const s = { ...ONE_OFF, fixedTicketPrice: null, dynamicTicketPriceMin: 0, freeEvent: false };
        expect(costFromSession(s)).toEqual({ min: 0 });
    });
});

describe("parseOneOffSession", () => {
    test("builds a discrete event with the venue-qualified summary", () => {
        const result = parseOneOffSession(ONE_OFF) as RipperCalendarEvent;
        expect(result.id).toBe("dragonfly-west-seattle-142505784");
        expect(result.summary).toBe("September SoundBath at Dragonfly");
        expect(result.description).toContain("SoundBath");
        expect(result.description).toContain("Instructor: Daniella White");
        expect(result.location).toContain("3270 California Ave SW");
        expect(result.url).toBe("https://momence.com/s/142505784");
        expect(result.duration.toMinutes()).toBe(60);
        expect(result.rrule).toBeUndefined();
        // 2026-09-21T02:00:00.000Z is 2026-09-20 19:00 Pacific (PDT, UTC-7)
        expect(result.date.dayOfMonth()).toBe(20);
        expect(result.date.hour()).toBe(19);
    });

    test("falls back to a 60-minute duration when durationMinutes is 0", () => {
        const result = parseOneOffSession({ ...ONE_OFF, durationMinutes: 0 }) as RipperCalendarEvent;
        expect(result.duration.toMinutes()).toBe(60);
    });

    test("returns a ParseError instead of dropping the session when startsAt is unparseable", () => {
        const result = parseOneOffSession({ ...ONE_OFF, startsAt: "not-a-date" }) as RipperError;
        expect(result.type).toBe("ParseError");
    });
});

describe("buildRecurringEvents", () => {
    test("dedupes repeated weekly occurrences into one event per (name, weekday, time) series", () => {
        const sessions = loadSample().filter(s => s.type === "fitness" && !s.isCancelled);
        const results = buildRecurringEvents(sessions);
        const events = results.filter((e): e is RipperCalendarEvent => "date" in e);

        // Fixture has VinyasaFlow at two distinct times (9am and 5:30pm Pacific)
        // plus PilatesFlow at one time repeated twice — three distinct series.
        expect(events).toHaveLength(3);
        expect(events.every(e => e.rrule?.startsWith("FREQ=WEEKLY;BYDAY="))).toBe(true);

        const pilates = events.find(e => e.summary === "PilatesFlow at Dragonfly")!;
        // Earliest of the two PilatesFlow occurrences anchors the event.
        expect(pilates.date.dayOfMonth()).toBe(17);
        // Recurring events must link to the venue's general booking page,
        // not a specific (soon-to-pass) session's booking link.
        expect(events.every(e => e.url === "https://www.dragonflywestseattle.com/")).toBe(true);
    });

    test("anchors each series on its earliest fetched occurrence, not fetch order", () => {
        const later: MomenceSession = {
            id: 1, sessionName: "Barre", type: "fitness", startsAt: "2026-10-01T17:00:00.000Z",
            durationMinutes: 45, freeEvent: false, isCancelled: false,
        };
        const earlier: MomenceSession = { ...later, id: 2, startsAt: "2026-09-24T17:00:00.000Z" };
        const events = buildRecurringEvents([later, earlier]).filter((e): e is RipperCalendarEvent => "date" in e);

        expect(events).toHaveLength(1);
        expect(events[0].date.monthValue()).toBe(9);
        expect(events[0].date.dayOfMonth()).toBe(24);
    });

    test("treats the same class name at a different weekday/time as a separate series", () => {
        const morning: MomenceSession = {
            id: 1, sessionName: "Vinyasa Flow", type: "fitness", startsAt: "2026-09-17T16:00:00.000Z",
            durationMinutes: 60, freeEvent: false, isCancelled: false,
        };
        const evening: MomenceSession = { ...morning, id: 2, startsAt: "2026-09-17T23:30:00.000Z" };
        const events = buildRecurringEvents([morning, evening]).filter((e): e is RipperCalendarEvent => "date" in e);
        expect(events).toHaveLength(2);
    });

    test("returns a ParseError instead of dropping the session when startsAt is unparseable", () => {
        const bad: MomenceSession = {
            id: 1, sessionName: "Broken", type: "fitness", startsAt: "not-a-date",
            durationMinutes: 60, freeEvent: false, isCancelled: false,
        };
        const results = buildRecurringEvents([bad]);
        expect(results).toHaveLength(1);
        expect((results[0] as RipperError).type).toBe("ParseError");
    });
});

describe("DragonflyWestSeattleRipper.rip", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("fetches all pages, separates one-off and recurring sessions, and excludes cancelled ones", async () => {
        const payload = loadSample();
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            const isFirstPage = url.includes("page=0");
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    payload: isFirstPage ? payload : [],
                    pagination: { page: isFirstPage ? 0 : 1, pageSize: 200, totalCount: payload.length },
                }),
            });
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new DragonflyWestSeattleRipper();
        const result = await ripper.rip(makeRipper());

        expect(result).toHaveLength(1);
        const { events, errors } = result[0];
        expect(errors).toHaveLength(0);

        // Fixture: 2 one-off special-event-new + 3 distinct recurring series
        // (the one cancelled VinyasaFlow occurrence is excluded).
        expect(events).toHaveLength(5);
        expect(events.filter(e => e.rrule)).toHaveLength(3);
        expect(events.filter(e => !e.rrule)).toHaveLength(2);
        expect(events.every(e => e.location?.includes("California Ave SW"))).toBe(true);
    });

    test("stops paginating once totalCount is reached", async () => {
        const calledUrls: string[] = [];
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            calledUrls.push(url);
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    payload: [ONE_OFF],
                    pagination: { page: 0, pageSize: 200, totalCount: 1 },
                }),
            });
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new DragonflyWestSeattleRipper();
        await ripper.rip(makeRipper());

        expect(calledUrls).toHaveLength(1);
    });

    test("actually fetches a second page when the first full page doesn't reach totalCount", async () => {
        const calledUrls: string[] = [];
        const fullPage = Array.from({ length: 200 }, (_, i) => ({ ...ONE_OFF, id: i + 1 }));
        const mockFetch = vi.fn().mockImplementation((url: string) => {
            calledUrls.push(url);
            const isFirstPage = url.includes("page=0");
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    payload: isFirstPage ? fullPage : [ONE_OFF],
                    pagination: { page: isFirstPage ? 0 : 1, pageSize: 200, totalCount: 201 },
                }),
            });
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new DragonflyWestSeattleRipper();
        await ripper.rip(makeRipper());

        expect(calledUrls).toHaveLength(2);
        expect(calledUrls[1]).toContain("page=1");
    });

    test("throws instead of silently truncating when the feed never satisfies totalCount within MAX_PAGES", async () => {
        // Every page reports more total than has ever been delivered, and
        // every page is full, so the loop can never break out naturally.
        const mockFetch = vi.fn().mockImplementation(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                payload: Array.from({ length: 200 }, (_, i) => ({ ...ONE_OFF, id: i + 1 })),
                pagination: { page: 0, pageSize: 200, totalCount: 999999 },
            }),
        }));
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new DragonflyWestSeattleRipper();
        await expect(ripper.rip(makeRipper())).rejects.toThrow(/did not terminate within/);
    });

    test("throws when a page request fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        const ripper = new DragonflyWestSeattleRipper();
        await expect(ripper.rip(makeRipper())).rejects.toThrow(/Failed to fetch Dragonfly West Seattle schedule/);
    });

    test("emits a ParseError instead of dropping a session with an unrecognized type", async () => {
        const weird = { ...ONE_OFF, id: 777, type: "mystery-type" };
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                payload: [weird],
                pagination: { page: 0, pageSize: 200, totalCount: 1 },
            }),
        });
        vi.stubGlobal("fetch", mockFetch);

        const ripper = new DragonflyWestSeattleRipper();
        const result = await ripper.rip(makeRipper());
        const { events, errors } = result[0];

        expect(events).toHaveLength(0);
        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe("ParseError");
        expect((errors[0] as RipperError & { reason: string }).reason).toContain("mystery-type");
    });
});
