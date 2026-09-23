import { describe, it, expect } from "vitest";
import { ZoneId, ZonedDateTime } from "@js-joda/core";
import '@js-joda/timezone';
import { readFileSync } from "fs";
import { join } from "path";
import { parseShowings, parseShowing } from "./ripper.js";
import { RipperCalendarEvent } from "../../lib/config/schema.js";

const tz = ZoneId.of("America/Los_Angeles");
const sample = JSON.parse(readFileSync(join(__dirname, "sample-data.json"), "utf8"));
const past = ZonedDateTime.parse("2026-01-01T00:00:00-08:00[America/Los_Angeles]");

describe("Tasveer Film Center ripper", () => {
    it("parses every showing from the sample", () => {
        const { events, errors } = parseShowings(sample, tz, past);
        expect(errors).toHaveLength(0);
        expect(events.length).toBe(sample.data.showingsForDate.data.length);
    });

    it("maps showing fields", () => {
        const { events } = parseShowings(sample, tz, past);
        const e = events.find(ev => ev.id === "tasveer-3954578")!;
        expect(e.summary).toBe("American Doctor");
        expect(e.date.toLocalDateTime().toString()).toBe("2026-09-24T17:30");
        expect(e.duration.toMinutes()).toBe(93);
        expect(e.url).toBe("https://filmcenter.tasveer.org/movie/american-doctor");
        expect(e.imageUrl).toContain("indy-systems.imgix.net/e5omxnn89de8wfvb3s93n0geh8od");
        expect(e.location).toContain("4812 Rainier Ave S");
        expect(e.description).not.toMatch(/<div>|&nbsp;/);
        expect(e.description).toContain("Screen: House 1");
    });

    it("drops past, private, and unpublished showings and dedups ids", () => {
        const base = sample.data.showingsForDate.data[0];
        const json = { data: { showingsForDate: { data: [
            base,
            base,
            { ...base, id: "p1", private: true },
            { ...base, id: "u1", published: false },
        ] } } };
        const { events } = parseShowings(json, tz, past);
        expect(events.map(e => e.id)).toEqual([`tasveer-${base.id}`]);
        const future = ZonedDateTime.parse("2030-01-01T00:00:00-08:00[America/Los_Angeles]");
        expect(parseShowings(json, tz, future).events).toHaveLength(0);
    });

    it("returns ParseErrors instead of dropping bad rows", () => {
        expect("date" in parseShowing({ id: "x", time: "bogus", movie: { id: "1", name: "Film" } }, tz)).toBe(false);
        expect("date" in parseShowing({ id: "y", time: "2026-10-01T00:00:00Z", movie: null }, tz)).toBe(false);
        const ok = parseShowing({ id: "z", time: "2026-10-01T00:00:00Z", movie: { id: "1", name: "Film", duration: null } }, tz) as RipperCalendarEvent;
        expect(ok.duration.toMinutes()).toBe(120);
    });

    it("reports an unexpected GraphQL response", () => {
        const { events, errors } = parseShowings({ data: {}, error: { message: "Site not found" } }, tz, past);
        expect(events).toHaveLength(0);
        expect(errors[0].type).toBe("ParseError");
    });
});
