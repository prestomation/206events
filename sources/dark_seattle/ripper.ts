import { Duration, LocalDate, LocalTime, ZonedDateTime } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "../../lib/config/schema.js";
import { HTMLElement, Node, NodeType } from "node-html-parser";
import { decode } from "html-entities";

// darkseattle.net is a hand-curated, single-page list of goth / industrial /
// darkwave / post-punk shows. The page's <main> is a flat sequence of:
//
//   <br>Sat, Sep 26<br><br>              <- date header (text node; optional ", 2027")
//   <div class="outlined">Title          <- one div per event
//     <hr>
//     <small>
//     8:00pm at The Showbox<br>          <- "<time> at <venue>[, <city>]"
//     <a href="...">Event details</a><br>
//     free-text notes
//     </small>
//   </div>
//
// Past events are kept inside a big HTML comment, which node-html-parser
// drops, so only current/future listings are parsed. Headers usually omit
// the year; it is inferred from the fetch date plus month rollover.
//
// The list covers the wider region; listings whose venue carries a
// non-Seattle city suffix ("..., Tacoma", "..., Portland, OR") are skipped.

// "Sat, Sep 26", "Wed, Mar 24, 2027", or a range "Thu, Nov 5 - Sun, Nov 8".
const MON = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const DATE_HEADER = new RegExp(
    `^[A-Z][a-z]{1,2},\\s+${MON}\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?` +
    `(?:\\s*-\\s*[A-Z][a-z]{1,2},\\s+${MON}\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?)?$`);
// Anything that starts like a date header but didn't match the full pattern.
const LOOKS_LIKE_HEADER = new RegExp(`^[A-Z][a-z]{1,2},\\s+${MON}\\s+\\d`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
const RANGE_RE = /^\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)|late)/i;

// City suffixes that mean "outside Seattle". Anything else (a Seattle
// neighborhood, a venue note) stays in, so an unlisted neighborhood never
// drops a real Seattle show.
const OUTSIDE_CITIES = new Set([
    "tacoma", "olympia", "everett", "bellingham", "gig harbor", "white center",
    "shoreline", "bellevue", "redmond", "kirkland", "renton", "kent", "auburn",
    "burien", "tukwila", "seatac", "des moines", "federal way", "lynnwood",
    "edmonds", "bothell", "kenmore", "lake forest park", "mountlake terrace",
    "mukilteo", "marysville", "issaquah", "sammamish", "woodinville", "puyallup",
    "lakewood", "bremerton", "port townsend", "port angeles", "vashon",
    "bainbridge island", "snohomish", "monroe", "north bend", "spokane",
    "portland", "vancouver", "boise",
]);

const DEFAULT_DURATION = Duration.ofHours(3);
const PLACEHOLDER_HOUR = 20;

export interface DarkSeattleListing {
    date: LocalDate;
    title: string;
    timeText: string;
    venue: string;
    link?: string;
    notes?: string;
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function parseClock(s: string): LocalTime | undefined {
    const m = TIME_RE.exec(s);
    if (!m) return undefined;
    let hour = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") hour += 12;
    const minute = m[2] ? Number(m[2]) : 0;
    if (minute > 59) return undefined;
    return LocalTime.of(hour, minute);
}

/** True when the venue string ends in a city outside Seattle. */
export function isOutsideSeattle(venue: string): boolean {
    const parts = venue.split(",").map(p => p.trim());
    if (parts.length < 2) return false;
    let suffix = parts[parts.length - 1];
    // "Portland, OR" -> state abbreviation: any explicit state means outside WA-Seattle
    // unless it's WA with a Seattle city before it.
    if (/^[A-Z]{2}$/.test(suffix)) {
        if (suffix !== "WA") return true;
        suffix = parts[parts.length - 2];
    }
    return OUTSIDE_CITIES.has(suffix.toLowerCase());
}

export default class DarkSeattleRipper extends HTMLRipper {
    public async parseEvents(html: HTMLElement, date: ZonedDateTime, _config: any): Promise<RipperEvent[]> {
        const main = html.querySelector("main");
        if (!main) {
            return [{ type: "ParseError", reason: "darkseattle.net page has no <main> element", context: undefined }];
        }

        const out: RipperEvent[] = [];
        const zone = date.zone();
        const today = date.toLocalDate();
        // Dates covered by the most recent header (one entry, or several for a
        // multi-day range header like "Thu, Nov 5 - Sun, Nov 8").
        let current: LocalDate[] | undefined;
        let prevMonth: number | undefined;
        let year = today.year();

        const resolveYear = (month: number, explicit?: string): number => {
            if (explicit) {
                year = Number(explicit);
            } else if (prevMonth === undefined) {
                // First live header: a month far behind today means next year.
                year = today.year();
                if (month < today.monthValue() - 6) year += 1;
                else if (month > today.monthValue() + 6) year -= 1;
            } else if (month < prevMonth) {
                year += 1;
            }
            prevMonth = month;
            return year;
        };

        for (const node of main.childNodes) {
            if (node.nodeType === NodeType.TEXT_NODE) {
                const text = decode(node.text).replace(/\s+/g, " ").trim();
                const m = DATE_HEADER.exec(text);
                if (!m) {
                    if (LOOKS_LIKE_HEADER.test(text)) {
                        current = undefined;
                        out.push({ type: "ParseError", reason: `Unrecognized date header "${text}"`, context: text });
                    }
                    continue;
                }
                try {
                    const startMonth = MONTHS.indexOf(m[1]) + 1;
                    const start = LocalDate.of(resolveYear(startMonth, m[3]), startMonth, Number(m[2]));
                    const days = [start];
                    if (m[4]) {
                        const endMonth = MONTHS.indexOf(m[4]) + 1;
                        const end = LocalDate.of(resolveYear(endMonth, m[6]), endMonth, Number(m[5]));
                        for (let d = start.plusDays(1); !d.isAfter(end) && days.length < 14; d = d.plusDays(1)) {
                            days.push(d);
                        }
                    }
                    current = days;
                } catch (e) {
                    current = undefined;
                    out.push({ type: "ParseError", reason: `Invalid date header "${text}"`, context: text });
                }
                continue;
            }
            if (!(node instanceof HTMLElement) || node.tagName !== "DIV" || !node.classList.contains("outlined")) continue;

            if (!current) {
                out.push({ type: "ParseError", reason: "Event listing appears before any date header", context: node.text.trim().slice(0, 100) });
                continue;
            }
            for (const day of current) {
                const listing = this.extractListing(node, day);
                if ("type" in listing) {
                    out.push(listing);
                    break;
                }
                // Regional list: keep only Seattle venues (intentional filter, not an error).
                if (isOutsideSeattle(listing.venue)) break;
                out.push(...this.buildEvent(listing, zone));
            }
        }

        // Same show listed twice on a day (rare) -> keep the first.
        const seen = new Set<string>();
        return out.filter(e => {
            if (!("date" in e) || !e.id) return true;
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
        }).filter((e, _i, arr) => {
            // Drop uncertainty errors whose event was deduped away.
            if ("type" in e && e.type === "Uncertainty") {
                return arr.some(x => x === e.event);
            }
            return true;
        });
    }

    private extractListing(div: HTMLElement, date: LocalDate): DarkSeattleListing | RipperError {
        const titleParts: string[] = [];
        for (const child of div.childNodes) {
            if (child instanceof HTMLElement && (child.tagName === "HR" || child.tagName === "SMALL")) break;
            titleParts.push(child.text);
        }
        const title = decode(titleParts.join(" ")).replace(/\s+/g, " ").trim();
        const small = div.querySelector("small");
        if (!title || !small) {
            return { type: "ParseError", reason: "Listing missing title or details block", context: div.text.trim().slice(0, 100) };
        }

        // Split <small> into lines at <br>.
        const lines: string[] = [];
        let buf = "";
        const flush = () => { const t = decode(buf).replace(/\s+/g, " ").trim(); if (t) lines.push(t); buf = ""; };
        const walk = (n: Node) => {
            if (n instanceof HTMLElement && n.tagName === "BR") { flush(); return; }
            if (n.nodeType === NodeType.TEXT_NODE) { buf += n.text; return; }
            if (n instanceof HTMLElement) n.childNodes.forEach(walk);
        };
        small.childNodes.forEach(walk);
        flush();

        const first = lines[0] ?? "";
        const at = first.indexOf(" at ");
        if (at < 0) {
            return { type: "ParseError", reason: `Could not find "<time> at <venue>" in "${first}"`, context: `${date} ${title}` };
        }
        const timeText = first.slice(0, at).trim();
        const venue = first.slice(at + 4).trim();
        const link = small.querySelector("a")?.getAttribute("href") ?? undefined;
        const notes = lines.slice(1).filter(l => l !== "Event details").join(" ").trim() || undefined;
        return { date, title, timeText, venue, link, notes };
    }

    private buildEvent(l: DarkSeattleListing, zone: any): RipperEvent[] {
        const start = parseClock(l.timeText);
        let duration = DEFAULT_DURATION;
        const range = RANGE_RE.exec(l.timeText);
        if (start && range && range[2].toLowerCase() !== "late") {
            const end = parseClock(range[2]);
            if (end) {
                let mins = (end.toSecondOfDay() - start.toSecondOfDay()) / 60;
                if (mins <= 0) mins += 24 * 60; // runs past midnight
                duration = Duration.ofMinutes(mins);
            }
        }

        const location = l.venue.includes("Seattle") ? l.venue : `${l.venue}, Seattle, WA`;
        const event: RipperCalendarEvent = {
            id: `dark-seattle-${l.date.toString()}-${slugify(l.title)}`,
            ripped: new Date(),
            date: ZonedDateTime.of(l.date, start ?? LocalTime.of(PLACEHOLDER_HOUR, 0), zone),
            duration,
            summary: l.title,
            description: [l.timeText ? `${l.timeText} at ${l.venue}` : undefined, l.notes].filter(Boolean).join("\n"),
            location,
            url: l.link,
        };
        if (start) return [event];

        const uncertainty: UncertaintyError = {
            type: "Uncertainty",
            reason: `No start time listed ("${l.timeText}") for "${l.title}" on ${l.date}`,
            source: "dark-seattle",
            unknownFields: ["startTime"],
            event,
            partialFingerprint: `${l.timeText}|${l.venue}`,
        };
        return [event, uncertainty];
    }
}
