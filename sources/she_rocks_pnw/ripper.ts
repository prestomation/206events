import { Duration, LocalDate, LocalDateTime, LocalTime, ZonedDateTime } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from "node-html-parser";

/**
 * She Rocks (PNW) — monthly women/non-binary climbing "gym nights".
 *
 * The Squarespace page https://www.sherocks-pnw.org/gym-night-dates is a
 * plain text page, one section per host gym:
 *
 *   <h3>Edgeworks Seattle</h3>
 *   <p>2839 NW Market St, Seattle, WA 98107</p>
 *   <p>... We meet the 3rd Thursday of each month, from 5:30 - 7:30 PM ...</p>
 *   <p>2026 Dates:</p>
 *   <p>1/15; 2/19; 3/19; ...</p>
 *
 * We walk h3/p elements in document order: each h3 opens a venue, and the
 * following paragraphs supply the address, the time range, the year
 * ("2026 Dates:") and the m/d date list. Only gyms inside Seattle city
 * limits are emitted (the Lynnwood / Shoreline gyms are skipped).
 */

interface VenueSection {
    name: string;
    address?: string;
    text: string[];
    year?: number;
    dates: Array<{ month: number; day: number }>;
}

const ADDRESS_RE = /,\s*[A-Za-z .]+,\s*WA\s+\d{5}/;
const YEAR_DATES_RE = /\b(20\d{2})\s+dates\s*:/i;
const MD_RE = /\b(\d{1,2})\/(\d{1,2})\b/g;
const TIME_RANGE_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function to24(hour: number, minute: number, meridiem: string): LocalTime {
    let h = hour % 12;
    if (meridiem.toLowerCase() === "pm") h += 12;
    return LocalTime.of(h, minute);
}

/** Parse "5:30 - 7:30 PM" / "7-9pm" / "6:30- 8:30 PM" into start + duration. */
export function parseTimeRange(text: string): { start: LocalTime; duration: Duration } | undefined {
    const m = text.match(TIME_RANGE_RE);
    if (!m) return undefined;
    const endMer = m[6];
    const startMer = m[3] || endMer;
    const start = to24(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, startMer);
    const end = to24(parseInt(m[4], 10), m[5] ? parseInt(m[5], 10) : 0, endMer);
    let duration = Duration.between(start, end);
    if (duration.isNegative() || duration.isZero()) duration = Duration.ofHours(2);
    return { start, duration };
}

export function extractSections(html: HTMLElement): VenueSection[] {
    const sections: VenueSection[] = [];
    let current: VenueSection | undefined;
    let inDates = false;
    for (const el of html.querySelectorAll("h3, p")) {
        const text = el.textContent.replace(/ /g, " ").replace(/\s+/g, " ").trim();
        if (el.tagName === "H3") {
            if (!text) continue;
            current = { name: text, text: [], dates: [] };
            sections.push(current);
            inDates = false;
            continue;
        }
        if (!current || !text) continue;
        const yearMatch = text.match(YEAR_DATES_RE);
        if (yearMatch) {
            current.year = parseInt(yearMatch[1], 10);
            inDates = true;
            // Dates may share the paragraph with the header.
            const rest = text.slice((yearMatch.index ?? 0) + yearMatch[0].length);
            for (const d of rest.matchAll(MD_RE)) {
                current.dates.push({ month: parseInt(d[1], 10), day: parseInt(d[2], 10) });
            }
            continue;
        }
        if (inDates) {
            for (const d of text.matchAll(MD_RE)) {
                current.dates.push({ month: parseInt(d[1], 10), day: parseInt(d[2], 10) });
            }
            continue;
        }
        if (!current.address && ADDRESS_RE.test(text) && text.length < 120) {
            current.address = text;
            continue;
        }
        current.text.push(text);
    }
    return sections;
}

export function isSeattleAddress(address: string | undefined): boolean {
    return !!address && /,\s*Seattle,\s*WA\b/i.test(address);
}

export default class SheRocksPnwRipper extends HTMLRipper {
    private seen = new Set<string>();

    protected async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const url = "https://www.sherocks-pnw.org/gym-night-dates";
        const zone = date.zone();

        for (const section of extractSections(html)) {
            // Only sections that actually list gym-night dates are events;
            // intentional content filter: skip gyms outside Seattle.
            if (section.dates.length === 0 && !section.year) continue;
            if (!isSeattleAddress(section.address)) continue;

            const time = section.text.map(parseTimeRange).find(t => t !== undefined);
            if (!time) {
                events.push({
                    type: "ParseError",
                    reason: `Could not find a time range for She Rocks gym night at "${section.name}"`,
                    context: section.text.join(" ").slice(0, 300),
                });
                continue;
            }
            if (!section.year) {
                events.push({
                    type: "ParseError",
                    reason: `No "<year> Dates:" header for She Rocks gym night at "${section.name}"`,
                    context: section.name,
                });
                continue;
            }

            const description = section.text.join("\n\n");
            for (const { month, day } of section.dates) {
                let localDate: LocalDate;
                try {
                    localDate = LocalDate.of(section.year, month, day);
                } catch {
                    events.push({
                        type: "ParseError",
                        reason: `Invalid date ${month}/${day}/${section.year} for "${section.name}"`,
                        context: section.name,
                    });
                    continue;
                }
                const id = `${slugify(section.name)}-${localDate.toString()}`;
                if (this.seen.has(id)) continue;
                this.seen.add(id);
                events.push({
                    id,
                    ripped: new Date(),
                    date: ZonedDateTime.of(LocalDateTime.of(localDate, time.start), zone),
                    duration: time.duration,
                    summary: `She Rocks Gym Night at ${section.name}`,
                    description,
                    location: `${section.name}, ${section.address}`,
                    url,
                });
            }
        }
        return events;
    }
}
