import { ZonedDateTime, LocalDate, Duration, ZoneId, ChronoUnit } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of("America/Los_Angeles");
// Used when a date line's end time can't be determined (flagged via Uncertainty).
const DEFAULT_DURATION_MINUTES = 120;

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export interface ParsedAccordionItem {
    title: string;
    // Raw inner HTML of the first <p> in the item's body (date/time/location
    // line(s), still containing <br/> tags and any inline markup).
    detailsHtml: string;
    url?: string;
}

// One "<Month> <day>[-<day>] | <start>-<end>" line within an item's details.
interface DateLine {
    month: number;
    day: number;
    endDay?: number;
    startTimeText: string;
    endTimeText?: string;
}

export default class SeattleHumaneRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const now = ZonedDateTime.now(TIMEZONE);

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; 206events/1.0)" },
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = parse(await res.text());
        const items = this.parseAccordionItems(html);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const item of items) {
            // Items with no recognizable date line are informational content
            // (e.g. an ongoing "Summer Camp" registration blurb), not a dated
            // one-off event — skip them rather than reporting a parse error.
            if (!this.hasDateLine(item.detailsHtml)) continue;

            const result = this.parseItem(item, now);
            for (const r of result) {
                if ("date" in r) events.push(r);
                else errors.push(r);
            }
        }

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events,
            errors,
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing. Each accordion item is a `.e-n-accordion-item`
    // (`<details>`) with a title and a details region whose first
    // `.elementor-widget-text-editor p` holds the date/time/location line(s)
    // and whose button widget (if present) links to the event's own page.
    public parseAccordionItems(html: HTMLElement): ParsedAccordionItem[] {
        const items: ParsedAccordionItem[] = [];

        for (const item of html.querySelectorAll(".e-n-accordion-item")) {
            const title = item.querySelector(".e-n-accordion-item-title-text")?.text?.trim();
            const detailsP = item.querySelector(".elementor-widget-text-editor p");
            if (!title || !detailsP) continue;

            const url = item.querySelector(".elementor-widget-button a")?.getAttribute("href")?.trim();

            items.push({ title, detailsHtml: detailsP.innerHTML, url: url || undefined });
        }

        return items;
    }

    // Public for testing.
    public hasDateLine(detailsHtml: string): boolean {
        return this.splitLines(detailsHtml).some(line => this.parseDateLine(line) !== null);
    }

    // Public for testing. Returns the event plus, when the time range
    // couldn't be fully resolved, a paired UncertaintyError with the same
    // event embedded (see docs/event-uncertainty.md).
    public parseItem(item: ParsedAccordionItem, now: ZonedDateTime): RipperEvent[] {
        const lines = this.splitLines(item.detailsHtml);
        const dateLines = lines.map(l => this.parseDateLine(l)).filter((d): d is DateLine => d !== null);
        const locationLines = lines.filter(l => this.parseDateLine(l) === null && l.length > 0);

        if (dateLines.length === 0) {
            return [{ type: "ParseError", reason: `No date line found in "${item.detailsHtml}"`, context: item.title }];
        }

        const first = dateLines[0];
        const last = dateLines[dateLines.length - 1];

        const startYear = this.resolveYear(first.month, first.day, now);
        const endYear = this.resolveYear(last.month, last.endDay ?? last.day, now);

        // A bare start time within a range ("3 - 8 p.m.") carries no meridiem
        // of its own — inherit it from that same line's end time.
        const firstLineEndMeridiem = first.endTimeText ? this.extractMeridiem(first.endTimeText) : undefined;
        const startTimeParsed = this.parseTime(first.startTimeText, firstLineEndMeridiem);
        const startTimeGuessed = startTimeParsed === null;
        const startTime = startTimeParsed ?? { hour: 10, minute: 0, meridiem: "am" as const };

        // Prefer the last line's own end time; fall back to the first line's
        // end time for a single-line range (e.g. "10 a.m. - 6 p.m.").
        const rawEndTimeText = last.endTimeText ?? first.endTimeText;
        const endTime = rawEndTimeText ? this.parseTime(rawEndTimeText, startTime.meridiem) : undefined;

        let date: ZonedDateTime;
        try {
            date = LocalDate.of(startYear, first.month, first.day)
                .atTime(startTime.hour, startTime.minute)
                .atZone(TIMEZONE);
        } catch (err) {
            return [{ type: "ParseError", reason: `Invalid start date ${startYear}-${first.month}-${first.day}: ${err}`, context: item.title }];
        }

        let durationMinutes = DEFAULT_DURATION_MINUTES;
        let durationGuessed = true;
        if (endTime) {
            try {
                const endDate = LocalDate.of(endYear, last.month, last.endDay ?? last.day)
                    .atTime(endTime.hour, endTime.minute)
                    .atZone(TIMEZONE);
                const minutes = date.until(endDate, ChronoUnit.MINUTES);
                if (minutes > 0) {
                    durationMinutes = minutes;
                    durationGuessed = false;
                }
            } catch {
                // Fall through with the guessed default below.
            }
        }

        const location = locationLines.join(", ").trim();

        const event: RipperCalendarEvent = {
            id: `seattle-humane-${this.slugify(item.title)}-${date.toLocalDate().toString()}`,
            ripped: new Date(),
            date,
            duration: Duration.ofMinutes(durationMinutes),
            summary: item.title,
            location: location ? this.normalizeLocation(location) : undefined,
            url: item.url,
        };

        const unknownFields: UncertaintyField[] = [];
        if (startTimeGuessed) unknownFields.push("startTime");
        if (durationGuessed) unknownFields.push("duration");
        if (unknownFields.length === 0) return [event];

        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: `Could not fully determine start/end times from "${item.detailsHtml}"`,
            source: "seattle-humane",
            unknownFields,
            event,
            partialFingerprint: this.fingerprint(item),
        };
        return [event, uncertainty];
    }

    // Public for testing. Splits a details paragraph's inner HTML into
    // plain-text lines on <br/> boundaries, stripping tags and decoding
    // entities (the source wraps some lines in nested Word-export <span>s).
    public splitLines(detailsHtml: string): string[] {
        return detailsHtml
            .split(/<br\s*\/?>/i)
            .map(fragment => decode(fragment.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
            .filter(line => line.length > 0);
    }

    // Public for testing. Matches lines like "September 4-7 | 10 a.m. - 6
    // p.m.", "Friday, September 11 | 3 - 8 p.m.", "September 25 | 11a.m.-1
    // p.m." and "November 7 & 8 | 10 a.m. - 5 p.m.". Returns null for lines
    // with no recognizable date (e.g. plain description/location text).
    public parseDateLine(line: string): DateLine | null {
        const normalized = line.replace(/[–—]/g, "-");
        const match = normalized.match(
            /^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*-\s*(\d{1,2})|\s*&\s*(\d{1,2}))?\s*\|\s*(.+)$/
        );
        if (!match) return null;

        const month = MONTHS[match[1].toLowerCase()];
        if (!month) return null;

        const day = parseInt(match[2], 10);
        const endDay = match[3] ? parseInt(match[3], 10) : match[4] ? parseInt(match[4], 10) : undefined;
        const timePart = match[5].trim();

        const timeMatch = timePart.match(/^(.+?)\s*-\s*(.+)$/);
        const startTimeText = timeMatch ? timeMatch[1].trim() : timePart;
        const endTimeText = timeMatch ? timeMatch[2].trim() : undefined;

        return { month, day, endDay, startTimeText, endTimeText };
    }

    // Public for testing. Parses a time token like "10 a.m.", "11a.m.", "3"
    // (no meridiem — inherits `inheritMeridiem`, typically the other end of
    // the same range) or "12" (noon, when the inherited meridiem is p.m.).
    public parseTime(text: string, inheritMeridiem: "am" | "pm" | undefined): { hour: number; minute: number; meridiem: "am" | "pm" } | null {
        const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
        if (!match) return null;

        let hour = parseInt(match[1], 10);
        const minute = match[2] ? parseInt(match[2], 10) : 0;
        const meridiemRaw = match[3]?.toLowerCase().replace(/\./g, "");
        const meridiem = (meridiemRaw === "am" || meridiemRaw === "pm" ? meridiemRaw : inheritMeridiem) ?? "am";

        if (hour === 12) hour = 0;
        if (meridiem === "pm") hour += 12;

        return { hour, minute, meridiem };
    }

    // Public for testing. The page prints no year — pick the current year
    // unless that date has already passed, in which case the event is
    // assumed to be next year's occurrence.
    public resolveYear(month: number, day: number, now: ZonedDateTime): number {
        const today = now.toLocalDate();
        try {
            const candidate = LocalDate.of(today.year(), month, day);
            return candidate.isBefore(today) ? today.year() + 1 : today.year();
        } catch {
            return today.year();
        }
    }

    // Public for testing. Named venues in this feed never print a state —
    // append one so the geocoder has a usable query.
    public normalizeLocation(raw: string): string {
        return /\bWA\b/i.test(raw) ? raw : `${raw}, WA`;
    }

    // Public for testing. Pulls just the meridiem off a time token, without
    // requiring the rest of it to be a fully parseable time.
    public extractMeridiem(text: string): "am" | "pm" | undefined {
        const match = text.match(/(a\.?m\.?|p\.?m\.?)\s*$/i);
        if (!match) return undefined;
        const clean = match[1].toLowerCase().replace(/\./g, "");
        return clean === "am" || clean === "pm" ? clean : undefined;
    }

    private slugify(text: string): string {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    // Stable hash of the raw details text, so the uncertainty-cache entry
    // invalidates if the source later adds/changes the time.
    private fingerprint(item: ParsedAccordionItem): string {
        const material = `seattle-humane|${item.title}|${item.detailsHtml}`;
        let h = 5381;
        for (let i = 0; i < material.length; i++) {
            h = ((h << 5) + h + material.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(16);
    }
}
