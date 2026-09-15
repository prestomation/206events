import { Duration, LocalDateTime, LocalDate, LocalTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { RipperCalendarEvent, RipperEvent } from "../../lib/config/schema.js";
import { HTMLElement } from "node-html-parser";

const TIMEZONE = ZoneId.of("America/Los_Angeles");
const LOCATION = "Nine Hats Wines, 3861 1st Ave S, Seattle, WA 98134";
const BASE_URL = "https://ninehatswines.com";

// e.g. "2026-09-16 06:00:00pm" — a 12-hour clock string with the am/pm
// suffix glued directly onto the seconds with no space or colon before it.
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(am|pm)$/i;

export function parseCardDatetime(raw: string | undefined): ZonedDateTime | undefined {
    if (!raw) return undefined;
    const match = raw.trim().match(DATETIME_RE);
    if (!match) return undefined;

    const [, year, month, day, hourStr, minute, second, ampm] = match;
    let hour = parseInt(hourStr, 10);
    if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;

    const date = LocalDate.of(parseInt(year, 10), parseInt(month, 10), parseInt(day, 10));
    const time = LocalTime.of(hour, parseInt(minute, 10), parseInt(second, 10));
    return ZonedDateTime.of(LocalDateTime.of(date, time), TIMEZONE);
}

// The card's `<img>` carries a comma-separated `data-srcset` ("url 1x, url
// 2x"); take the lowest-resolution (first) candidate.
export function firstSrcsetUrl(srcset: string | undefined): string | undefined {
    if (!srcset) return undefined;
    return srcset.split(",")[0]?.trim().split(/\s+/)[0] || undefined;
}

export default class NineHatsWinesRipper extends HTMLRipper {
    private seenEvents = new Set<string>();

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const results: RipperEvent[] = [];
        // Each upcoming-event card is an <li data-loop="false"> inside the
        // "Upcoming Events" grid — the only elements on the page carrying
        // this attribute.
        const cards = html.querySelectorAll("li[data-loop]");

        for (const card of cards) {
            const title = card.querySelector("h3")?.textContent.trim();
            if (!title) {
                results.push({ type: "ParseError", reason: "Event card has no title", context: undefined });
                continue;
            }

            const rawDatetime = card.querySelector("time")?.getAttribute("datetime");
            const startDate = parseCardDatetime(rawDatetime);
            if (!startDate) {
                results.push({ type: "ParseError", reason: `Unrecognized datetime "${rawDatetime}"`, context: title });
                continue;
            }

            const slug = card.querySelector("a.expanded-card-click")?.getAttribute("href")?.split("/").pop();
            const id = `nine-hats-wines-${slug || title}-${startDate.toLocalDate()}`;
            if (this.seenEvents.has(id)) continue;
            this.seenEvents.add(id);

            const description = card.querySelector("div.clamp-3")?.textContent.trim() || undefined;
            const imageUrl = firstSrcsetUrl(card.querySelector("img")?.getAttribute("data-srcset"));

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                date: startDate,
                duration: Duration.ofHours(2),
                summary: title,
                description,
                location: LOCATION,
                url: slug ? `${BASE_URL}/events/${slug}` : `${BASE_URL}/events`,
                imageUrl,
            };

            results.push(event);
        }

        return results;
    }
}
