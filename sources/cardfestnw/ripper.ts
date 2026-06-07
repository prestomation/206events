import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of('America/Los_Angeles');

export interface EventBlock {
    slug: string;
    dateText: string;
    timeText: string;
    building: string;
    address: string;
}

export default class CardfestNWRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const res = await fetchFn(ripper.config.url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        if (!res.ok) throw new Error(`cardfestnw.com returned ${res.status}`);

        const html = await res.text();
        const blocks = this.parseEventBlocks(html);

        const now = ZonedDateTime.now(TIMEZONE);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const block of blocks) {
            const title = await this.fetchEventTitle(block.slug, fetchFn);
            const result = this.parseEvent(block, title);
            if ('date' in result) {
                if (!result.date.isBefore(now)) events.push(result);
            } else {
                errors.push(result);
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

    // Public for testing
    parseEventBlocks(html: string): EventBlock[] {
        const blocks: EventBlock[] = [];

        // Event sections are delimited by '>Date<' labels; slice between them
        const datePositions: number[] = [];
        const dateLabelRe = />Date</g;
        let m;
        while ((m = dateLabelRe.exec(html)) !== null) {
            datePositions.push(m.index);
        }

        for (let i = 0; i < datePositions.length; i++) {
            const start = datePositions[i];
            const end = i + 1 < datePositions.length ? datePositions[i + 1] : html.length;
            const chunk = html.substring(start, end);

            const dateText = this.extractTitleAfterLabel(chunk, 'Date');
            const timeText = this.extractTitleAfterLabel(chunk, 'Time');
            const building = this.extractTitleAfterLabel(chunk, 'Building');
            const address = this.extractTitleAfterLabel(chunk, 'Address');

            const slugMatch = chunk.match(/ontreasure\.com\/events\/([^/\s"&]+)\/tickets/);
            const slug = slugMatch ? slugMatch[1] : null;

            if (!dateText || !timeText || !building || !address || !slug) continue;

            blocks.push({ slug, dateText, timeText, building, address });
        }

        return blocks;
    }

    private extractTitleAfterLabel(html: string, label: string): string | null {
        const pos = html.indexOf(`>${label}<`);
        if (pos < 0) return null;
        const after = html.substring(pos, pos + 500);
        const match = after.match(/title="([^"]+)"/);
        return match ? match[1] : null;
    }

    private async fetchEventTitle(slug: string, fetchFn: FetchFn): Promise<string> {
        const url = `https://www.ontreasure.com/events/${slug}`;
        try {
            const res = await fetchFn(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            if (res.ok) {
                const html = await res.text();
                const m = html.match(/<title>([^|<]+?)\s*(?:\|\s*Treasure)?<\/title>/);
                if (m) return m[1].trim();
            }
        } catch {
            // Fall through to slug-derived title
        }
        return this.titleFromSlug(slug);
    }

    titleFromSlug(slug: string): string {
        // Slugs end with MMDDYYYY date, e.g. "emerald-city-cardfest-seattle-06062026"
        const withoutDate = slug.replace(/-\d{8}$/, '');
        return withoutDate.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    // Public for testing
    parseEvent(block: EventBlock, title: string): RipperCalendarEvent | RipperError {
        // Parse date from slug suffix: MMDDYYYY
        const dateMatch = block.slug.match(/(\d{2})(\d{2})(\d{4})$/);
        if (!dateMatch) {
            return {
                type: 'ParseError',
                reason: `Could not parse date from slug: ${block.slug}`,
                context: block.slug,
            };
        }
        const month = parseInt(dateMatch[1], 10);
        const day = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        // Parse time range from timeText, e.g. "12pm-5pm (10am VIP Entry)"
        const timeMatch = block.timeText.match(/^(\d{1,2})(am|pm)-(\d{1,2})(am|pm)/i);
        if (!timeMatch) {
            return {
                type: 'ParseError',
                reason: `Could not parse time from: ${block.timeText}`,
                context: block.slug,
            };
        }

        let startHour = parseInt(timeMatch[1], 10);
        const startAmPm = timeMatch[2].toLowerCase();
        let endHour = parseInt(timeMatch[3], 10);
        const endAmPm = timeMatch[4].toLowerCase();

        if (startAmPm === 'pm' && startHour !== 12) startHour += 12;
        else if (startAmPm === 'am' && startHour === 12) startHour = 0;

        if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
        else if (endAmPm === 'am' && endHour === 12) endHour = 0;

        const durationMinutes = endHour > startHour
            ? (endHour - startHour) * 60
            : (24 - startHour + endHour) * 60;
        if (durationMinutes <= 0) {
            return {
                type: 'ParseError',
                reason: `Computed non-positive duration from: ${block.timeText}`,
                context: block.slug,
            };
        }

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, startHour, 0),
            TIMEZONE
        );

        return {
            id: `cardfestnw-${block.slug}`,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            location: `${block.building}, ${block.address}`,
            url: `https://www.ontreasure.com/events/${block.slug}`,
        };
    }
}
