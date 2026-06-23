import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parse } from "node-html-parser";
import { parseEventsFromHtml } from "./ripper.js";
import { RipperCalendarEvent, UncertaintyError } from "../../lib/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSample(): ReturnType<typeof parse> {
    const html = readFileSync(join(__dirname, "sample-data.html"), "utf-8");
    return parse(html);
}

describe("SeattleArtsLecturesRipper", () => {
    it("parses events from sample HTML", () => {
        const doc = loadSample();
        const result = parseEventsFromHtml(doc);

        const events = result.filter((e): e is RipperCalendarEvent => "date" in e);
        const errors = result.filter(e => "type" in e && (e as any).type === "Uncertainty");
        const parseErrors = result.filter(e => "type" in e && (e as any).type === "ParseError");

        expect(events.length).toBeGreaterThanOrEqual(30);
        expect(parseErrors.length).toBe(0);
        // Each event has a corresponding UncertaintyError for start time
        expect(errors.length).toBe(events.length);
    });

    it("emits UncertaintyErrors for start time on every event", () => {
        const doc = loadSample();
        const result = parseEventsFromHtml(doc);

        const events = result.filter((e): e is RipperCalendarEvent => "date" in e);
        const uncertainties = result.filter((e): e is UncertaintyError => "type" in e && (e as any).type === "Uncertainty");

        expect(uncertainties.length).toBe(events.length);
        for (const u of uncertainties) {
            expect(u.unknownFields).toContain("startTime");
        }
    });

    it("parses event dates correctly", () => {
        const doc = loadSample();
        const result = parseEventsFromHtml(doc);
        const events = result.filter((e): e is RipperCalendarEvent => "date" in e);

        // Ann Patchett is July 9, 2026
        const annPatchett = events.find(e => e.summary.includes("Ann Patchett"));
        expect(annPatchett).toBeDefined();
        expect(annPatchett!.date.year()).toBe(2026);
        expect(annPatchett!.date.monthValue()).toBe(7);
        expect(annPatchett!.date.dayOfMonth()).toBe(9);
    });

    it("includes event URLs", () => {
        const doc = loadSample();
        const result = parseEventsFromHtml(doc);
        const events = result.filter((e): e is RipperCalendarEvent => "date" in e);

        for (const event of events) {
            expect(event.url).toMatch(/https:\/\/lectures\.org\/event\//);
        }
    });

    it("produces stable event IDs", () => {
        const doc = loadSample();
        const run1 = parseEventsFromHtml(doc).filter((e): e is RipperCalendarEvent => "date" in e);
        const run2 = parseEventsFromHtml(doc).filter((e): e is RipperCalendarEvent => "date" in e);

        expect(run1.map(e => e.id)).toEqual(run2.map(e => e.id));
    });

    it("assigns default duration of 2 hours", () => {
        const doc = loadSample();
        const events = parseEventsFromHtml(doc).filter((e): e is RipperCalendarEvent => "date" in e);
        for (const event of events) {
            expect(event.duration.toMinutes()).toBe(120);
        }
    });
});
