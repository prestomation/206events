import { Duration, LocalDateTime, ZonedDateTime, ZoneId, LocalDate } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const VENUE_ADDRESS = "Brick Park PSQ, 310 Occidental Ave S, Seattle, WA 98104";

const MONTHS: Record<string, number> = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
};

// Abbreviated month names as used on the site (e.g. "June", "July", "Aug", "Sept")
const MONTH_ABBR: Record<string, number> = {
    ...MONTHS,
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Sept": 9, "Oct": 10, "Nov": 11, "Dec": 12,
};

/**
 * Ripper for Brick Park PSQ — a Squarespace site that lists events as
 * hardcoded HTML content blocks on the homepage (not a Squarespace events
 * collection, so the built-in SquarespaceRipper won't work).
 *
 * Each event is a <div class="sqs-html-content"> containing:
 *   <h4> presenter line (e.g. "Hometeam & Brick Park present:") </h4>
 *   <h3> "Fri June 12<br>Event Name" </h3>
 *   <h4> optional sub-info / ticket links </h4>
 *
 * Ticket links (tixr.com, eventbrite.com, axs.com) appear in <a> tags
 * within the content blocks or in nearby button elements.
 */
export default class BrickParkPSQRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: { [key: string]: { events: RipperEvent[], friendlyName: string, tags: string[] } } = {};
        for (const c of ripper.config.calendars) {
            calendars[c.name] = { events: [], friendlyName: c.friendlyname, tags: c.tags || [] };
        }

        const res = await fetch(ripper.config.url.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CalendarRipper/1.0)" }
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = parse(await res.text());
        const events = this.parseEvents(html);

        for (const cal of ripper.config.calendars) {
            calendars[cal.name].events = events;
        }

        return Object.keys(calendars).map(key => ({
            name: key,
            friendlyname: calendars[key].friendlyName,
            events: calendars[key].events.filter(e => "date" in e).map(e => e as RipperCalendarEvent),
            errors: calendars[key].events.filter(e => "type" in e).map(e => e as RipperError),
            parent: ripper.config,
            tags: calendars[key].tags,
        }));
    }

    public parseEvents(html: HTMLElement): RipperEvent[] {
        const events: RipperEvent[] = [];
        const seenIds = new Set<string>();

        // Find the "Upcoming Events" heading, then iterate through subsequent
        // sqs-html-content blocks until we hit "Past Events".
        const allBlocks = html.querySelectorAll("div.sqs-html-content");
        let inUpcoming = false;

        for (const block of allBlocks) {
            const text = block.text.trim();

            // Detect the "Upcoming Events" header block
            if (/Upcoming Events/i.test(text)) {
                inUpcoming = true;
                continue;
            }
            // Stop at "Past Events"
            if (/Past Events/i.test(text)) {
                break;
            }
            if (!inUpcoming) continue;

            // Each event block has an <h3> with "Day Month DD\nEvent Name"
            const h3 = block.querySelector("h3");
            if (!h3) continue;

            const h3Text = h3.innerHTML;
            // Split on <br> to get date line and event name
            const parts = h3Text.split(/<br\s*\/?>/i);
            if (parts.length < 2) continue;

            const dateLine = parts[0].replace(/<[^>]+>/g, '').trim();
            const eventName = parts.slice(1).join(' ').replace(/<[^>]+>/g, '').trim();

            if (!dateLine || !eventName) continue;

            // Parse the date: "Fri June 12", "Sat Aug 15", "Sat Sept 26"
            const dateMatch = dateLine.match(/^(\w+)\s+(\w+)\s+(\d{1,2})$/);
            if (!dateMatch) {
                events.push({
                    type: "ParseError" as const,
                    reason: `Could not parse date line: "${dateLine}" for event "${eventName}"`,
                    context: dateLine,
                });
                continue;
            }

            const monthName = dateMatch[2];
            const day = parseInt(dateMatch[3], 10);
            const month = MONTH_ABBR[monthName];
            if (!month) {
                events.push({
                    type: "ParseError" as const,
                    reason: `Unknown month: "${monthName}" for event "${eventName}"`,
                    context: dateLine,
                });
                continue;
            }

            // Infer year: if the date is more than 7 days in the past, assume next year
            const now = LocalDate.now();
            let year = now.year();
            try {
                const candidate = LocalDate.of(year, month, day);
                if (candidate.isBefore(now.minusDays(7))) {
                    year += 1;
                }
            } catch {
                events.push({
                    type: "ParseError" as const,
                    reason: `Invalid date: ${monthName} ${day} for event "${eventName}"`,
                    context: dateLine,
                });
                continue;
            }

            // Extract presenter line from first <h4>
            const h4s = block.querySelectorAll("h4");
            const presenter = h4s.length > 0 ? h4s[0].text.trim() : "";

            // Extract ticket link from <a> tags within the block
            let ticketUrl: string | undefined;
            const anchors = block.querySelectorAll("a");
            for (const a of anchors) {
                const href = a.getAttribute("href") || "";
                if (/tixr\.com|eventbrite\.com|axs\.com/i.test(href)) {
                    ticketUrl = href;
                    break;
                }
            }

            // Also look for ticket links in nearby button elements outside the content block
            // (Squarespace sometimes places button blocks after the text block)

            // Build event ID from the event name + date
            const eventId = `brickpark-${year}-${month}-${day}-${eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            if (seenIds.has(eventId)) continue;
            seenIds.add(eventId);

            // Build summary
            let summary = eventName;
            if (presenter) {
                // Only prepend presenter if it adds info beyond "Hometeam & Brick Park present:"
                // Keep it simple — include the presenter as it often has the real promoter
                summary = `${eventName}`;
            }

            // Build description
            let description = "";
            if (presenter) {
                description += `${presenter}\n`;
            }
            description += `\nVenue: ${VENUE_ADDRESS}`;
            if (ticketUrl) {
                description += `\n\nTickets: ${ticketUrl}`;
            }

            // Default to 7 PM start time (summer concert series, typical evening start)
            // No time info is available on the page
            const eventDate = ZonedDateTime.of(
                LocalDateTime.of(year, month, day, 19, 0),
                TIMEZONE
            );

            const event: RipperCalendarEvent = {
                id: eventId,
                ripped: new Date(),
                date: eventDate,
                duration: Duration.ofHours(3),
                summary,
                description,
                location: VENUE_ADDRESS,
                url: ticketUrl || "https://www.brickparkpsq.com/",
                // These are free events (soccer viewing parties are free, concerts are free)
                cost: { min: 0 },
            };

            events.push(event);

            // Flag uncertainty: start time is guessed (no time on the page)
            const unknownFields: UncertaintyField[] = ["startTime", "duration"];
            events.push({
                type: "Uncertainty" as const,
                reason: "Brick Park PSQ does not publish event times; defaulted to 7 PM / 3 hours",
                source: "brick-park-psq",
                unknownFields,
                event,
                partialFingerprint: simpleHash(`${year}-${month}-${day}-${eventName}`),
            });
        }

        return events;
    }
}