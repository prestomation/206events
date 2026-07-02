import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
    extractDetailUrls,
    slugFromUrl,
    extractTitle,
    extractCleanStartDate,
    extractFreeTextDateTime,
    extractDateOnlyStartDates,
    extractOffersUrl,
    extractLocation,
    extractDuration,
    parseDetailPage,
} from "./ripper.js";
import { RipperCalendarEvent, RipperError, UncertaintyError } from "../../lib/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSample(name: string): string {
    return readFileSync(join(__dirname, name), "utf-8");
}

const FILM_URL = "https://nwfilmforum.org/films/free-forum-stop-making-sense/";
const EVENT_URL = "https://nwfilmforum.org/events/squeakyfest-seattle/";
const CLOSURE_URL = "https://nwfilmforum.org/events/nwff-summer-break-2026/";
const WORKSHOP_URL = "https://nwfilmforum.org/education/workshops/camp2-2026/";

describe("extractDetailUrls", () => {
    it("extracts unique nwfilmforum.org detail-page URLs from a day fragment", () => {
        const { html } = JSON.parse(readSample("sample-data-day-fragment.json"));
        const urls = extractDetailUrls(html);
        expect(urls).toContain(FILM_URL);
        expect(urls).toContain("https://nwfilmforum.org/films/free-forum-happy-together/");
        expect(urls.length).toBe(2);
    });

    it("excludes wp-content and wp-json asset URLs", () => {
        const html = `
            <a href="https://nwfilmforum.org/films/some-film/">Film</a>
            <div component-graceful-image-load="https://nwfilmforum.org/wp-content/uploads/2026/foo.jpg"></div>
            <a href="https://nwfilmforum.org/wp-json/nwff/v1/html/calendar/day?date=2026-07-10">API</a>
        `;
        const urls = extractDetailUrls(html);
        expect(urls).toEqual(["https://nwfilmforum.org/films/some-film/"]);
    });

    it("deduplicates a URL that appears more than once in a single fragment", () => {
        const html = `
            <a href="https://nwfilmforum.org/films/repeat-film/">A</a>
            <a href="https://nwfilmforum.org/films/repeat-film/">B</a>
        `;
        expect(extractDetailUrls(html)).toEqual(["https://nwfilmforum.org/films/repeat-film/"]);
    });

    it("returns an empty array when no links are found", () => {
        expect(extractDetailUrls("<article>no links here</article>")).toEqual([]);
    });

    it("dedupes a URL appearing across multiple day-fragments (multi-day series)", () => {
        const dayOne = '<a href="https://nwfilmforum.org/films/multi-day-series/">A</a>';
        const dayTwo = '<a href="https://nwfilmforum.org/films/multi-day-series/">A</a>';
        const dayThree = '<a href="https://nwfilmforum.org/films/another-film/">B</a>';

        const merged = new Set<string>();
        for (const fragment of [dayOne, dayTwo, dayThree]) {
            for (const url of extractDetailUrls(fragment)) merged.add(url);
        }

        expect([...merged].sort()).toEqual([
            "https://nwfilmforum.org/films/another-film/",
            "https://nwfilmforum.org/films/multi-day-series/",
        ]);
    });
});

describe("slugFromUrl", () => {
    it("extracts the last path segment from a /films/ URL", () => {
        expect(slugFromUrl(FILM_URL)).toBe("free-forum-stop-making-sense");
    });

    it("extracts the last path segment from an /education/workshops/ URL", () => {
        expect(slugFromUrl(WORKSHOP_URL)).toBe("camp2-2026");
    });

    it("returns null for an unparseable URL", () => {
        expect(slugFromUrl("not-a-url")).toBeNull();
    });
});

describe("extractTitle", () => {
    it("extracts the title from a /films/ page", () => {
        expect(extractTitle(readSample("sample-data-film.html"))).toBe("FREE FORUM 2026: Stop Making Sense");
    });

    it("extracts the title from an /events/ page", () => {
        expect(extractTitle(readSample("sample-data-event.html"))).toBe("SqueakyFest Seattle");
    });

    it("extracts the title from the closure-notice page", () => {
        expect(extractTitle(readSample("sample-data-closure.html"))).toBe("NWFF Summer Break 2026");
    });

    it("returns null when no h1 itemprop=name is present", () => {
        expect(extractTitle("<html><body>nothing here</body></html>")).toBeNull();
    });
});

describe("extractCleanStartDate", () => {
    it("parses the valid ISO startDate meta on a /films/ page", () => {
        const result = extractCleanStartDate(readSample("sample-data-film.html"));
        expect(result).not.toBeNull();
        expect(result!.toString()).toBe("2026-07-10T19:00");
    });

    it("returns null for the broken content=\"T\" startDate on an /events/ page", () => {
        expect(extractCleanStartDate(readSample("sample-data-event.html"))).toBeNull();
    });

    it("returns null for a date-only startDate (no time part) on a workshop page", () => {
        expect(extractCleanStartDate(readSample("sample-data-workshop.html"))).toBeNull();
    });

    it("returns null when no startDate meta is present at all", () => {
        expect(extractCleanStartDate("<html><body>none</body></html>")).toBeNull();
    });
});

describe("extractFreeTextDateTime", () => {
    it("parses the free-text date/time block, preferring showtime over doors", () => {
        const result = extractFreeTextDateTime(readSample("sample-data-event.html"));
        expect(result).not.toBeNull();
        expect(result!.toString()).toBe("2026-07-22T19:00");
    });

    it("returns null for the closure notice (no free-text date block at all)", () => {
        expect(extractFreeTextDateTime(readSample("sample-data-closure.html"))).toBeNull();
    });

    it("returns null for a multi-day date range with no weekday (camp page)", () => {
        // "July 27-31, 2026" has no leading weekday, so it correctly does
        // not match — this ripper doesn't guess which single day/time a
        // multi-day camp should collapse to.
        expect(extractFreeTextDateTime(readSample("sample-data-workshop.html"))).toBeNull();
    });

    it("uses the single time present when only one time appears", () => {
        const html = "Friday, August 7th, 2026<br />8:00pm";
        const result = extractFreeTextDateTime(html);
        expect(result).not.toBeNull();
        expect(result!.toString()).toBe("2026-08-07T20:00");
    });

    it("handles noon and midnight correctly (12pm/12am)", () => {
        expect(extractFreeTextDateTime("Saturday, March 14th, 2026<br />12:00pm showtime")!.toString())
            .toBe("2026-03-14T12:00");
        expect(extractFreeTextDateTime("Saturday, March 14th, 2026<br />12:00am showtime")!.toString())
            .toBe("2026-03-14T00:00");
    });
});

describe("extractDateOnlyStartDates", () => {
    it("extracts every date-only startDate on a multi-day workshop page", () => {
        const dates = extractDateOnlyStartDates(readSample("sample-data-workshop.html"));
        expect(dates.map(d => d.toString())).toEqual([
            "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31",
        ]);
    });

    it("returns an empty array for a page with a real time-of-day startDate", () => {
        expect(extractDateOnlyStartDates(readSample("sample-data-film.html"))).toEqual([]);
    });

    it("returns an empty array for the closure notice (startDate is just \"T\", not date-only)", () => {
        expect(extractDateOnlyStartDates(readSample("sample-data-closure.html"))).toEqual([]);
    });
});

describe("extractOffersUrl", () => {
    it("extracts the ticket/registration URL from a /films/ page", () => {
        expect(extractOffersUrl(readSample("sample-data-film.html")))
            .toBe("https://nwfilmforum.eventive.org/schedule/6a21eca1bfe1194ea66d024b");
    });

    it("extracts the registration URL from a multi-day workshop page", () => {
        expect(extractOffersUrl(readSample("sample-data-workshop.html")))
            .toBe("https://pci.jotform.com/form/260876607692167");
    });

    it("returns null for the closure notice (empty offers content=\"\")", () => {
        expect(extractOffersUrl(readSample("sample-data-closure.html"))).toBeNull();
    });

    it("returns null when no offers block is present", () => {
        expect(extractOffersUrl("<html><body>none</body></html>")).toBeNull();
    });
});

describe("extractLocation", () => {
    it("extracts venue name and address from a /films/ MovieTheater block", () => {
        expect(extractLocation(readSample("sample-data-film.html")))
            .toBe("Northwest Film Forum, 1515 12th Ave, Seattle WA 98122");
    });

    it("extracts venue name and address from an /events/ Place block", () => {
        expect(extractLocation(readSample("sample-data-event.html")))
            .toBe("Northwest Film Forum, 1515 12th Ave, Seattle WA 98122");
    });

    it("returns null when no location block is present", () => {
        expect(extractLocation("<html><body>none</body></html>")).toBeNull();
    });
});

describe("extractDuration", () => {
    it("extracts the real duration from a /films/ page", () => {
        expect(extractDuration(readSample("sample-data-film.html")).toMinutes()).toBe(88);
    });

    it("defaults to 2 hours when no duration meta is present", () => {
        expect(extractDuration(readSample("sample-data-event.html")).toHours()).toBe(2);
    });
});

describe("parseDetailPage", () => {
    it("parses a /films/ page using the clean startDate meta", () => {
        const results = parseDetailPage(readSample("sample-data-film.html"), FILM_URL);
        expect(results.length).toBe(1);
        expect("date" in results[0]).toBe(true);
        const event = results[0] as RipperCalendarEvent;
        expect(event.id).toBe("free-forum-stop-making-sense-2026-07-10");
        expect(event.summary).toBe("FREE FORUM 2026: Stop Making Sense");
        expect(event.date.year()).toBe(2026);
        expect(event.date.monthValue()).toBe(7);
        expect(event.date.dayOfMonth()).toBe(10);
        expect(event.date.hour()).toBe(19);
        expect(event.date.minute()).toBe(0);
        expect(event.date.zone().id()).toBe("America/Los_Angeles");
        expect(event.duration.toMinutes()).toBe(88);
        expect(event.location).toBe("Northwest Film Forum, 1515 12th Ave, Seattle WA 98122");
        expect(event.url).toBe(FILM_URL);
    });

    it("parses an /events/ page using the free-text date/time fallback", () => {
        const results = parseDetailPage(readSample("sample-data-event.html"), EVENT_URL);
        expect(results.length).toBe(1);
        expect("date" in results[0]).toBe(true);
        const event = results[0] as RipperCalendarEvent;
        expect(event.id).toBe("squeakyfest-seattle-2026-07-22");
        expect(event.summary).toBe("SqueakyFest Seattle");
        expect(event.date.monthValue()).toBe(7);
        expect(event.date.dayOfMonth()).toBe(22);
        expect(event.date.hour()).toBe(19); // showtime preferred over 6:30pm doors
        expect(event.date.minute()).toBe(0);
        expect(event.location).toBe("Northwest Film Forum, 1515 12th Ave, Seattle WA 98122");
    });

    it("returns an empty array for the closure notice (no ticket URL, no date signal — not a real event)", () => {
        const results = parseDetailPage(readSample("sample-data-closure.html"), CLOSURE_URL);
        expect(results).toEqual([]);
    });

    it("returns [event, uncertainty] for a multi-day camp with dated-but-timeless CourseInstances", () => {
        const results = parseDetailPage(readSample("sample-data-workshop.html"), WORKSHOP_URL);
        expect(results.length).toBe(2);

        expect("date" in results[0]).toBe(true);
        const event = results[0] as RipperCalendarEvent;
        expect(event.id).toBe("camp2-2026-2026-07-27");
        expect(event.summary).toContain("Summer Camp 2");
        expect(event.date.toLocalDate().toString()).toBe("2026-07-27");
        expect(event.date.hour()).toBe(12); // placeholder — real time unknown
        expect(event.duration.toDays()).toBe(5); // Jul 27–31 inclusive
        expect(event.location).toBe("Northwest Film Forum, 1515 12th Ave, Seattle WA 98122");

        expect("type" in results[1]).toBe(true);
        const uncertainty = results[1] as UncertaintyError;
        expect(uncertainty.type).toBe("Uncertainty");
        expect(uncertainty.source).toBe("northwest-film-forum");
        expect(uncertainty.unknownFields).toEqual(["startTime", "duration"]);
        expect(uncertainty.event.id).toBe(event.id);
    });

    it("returns an empty array (not a crash) for a page with no title", () => {
        const results = parseDetailPage("<html><body>empty</body></html>", FILM_URL);
        // No title at all is treated as "nothing to report", same as the
        // closure-notice case — not a page we can attribute an error to.
        expect(results).toEqual([]);
    });

    it("returns a ParseError for a ticketed page with a title but no parseable date at all", () => {
        const html = `
            <h1 itemprop="name">Some Real Ticketed Thing</h1>
            <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
                <meta itemprop="url" content="https://nwfilmforum.eventive.org/schedule/abc123" />
            </div>
        `;
        const results = parseDetailPage(html, FILM_URL);
        expect(results.length).toBe(1);
        expect("type" in results[0]).toBe(true);
        expect((results[0] as RipperError).type).toBe("ParseError");
        expect((results[0] as RipperError).context).toBe(FILM_URL);
    });

    it("produces stable, deterministic ids across repeated parses", () => {
        const html = readSample("sample-data-film.html");
        const first = parseDetailPage(html, FILM_URL);
        const second = parseDetailPage(html, FILM_URL);
        expect(first.length).toBe(1);
        expect(second.length).toBe(1);
        expect("date" in first[0] && "date" in second[0]).toBe(true);
        expect((first[0] as RipperCalendarEvent).id).toBe((second[0] as RipperCalendarEvent).id);
    });
});
