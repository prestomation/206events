import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION = "Interbay Stadium, Seattle, WA";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION_HOURS = 2;
const SCHEDULE_URL = "https://www.goballardfc.com/schedule/";

const MONTH_NAMES: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

export interface ParsedGameDate {
    month: number;
    day: number;
}

export interface ParsedGameTime {
    hour: number;
    minute: number;
}

export default class BallardFCRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        if (!ripper.config.calendars || ripper.config.calendars.length === 0) {
            throw new Error('No calendars configured');
        }
        const calConfig = ripper.config.calendars[0];

        const res = await this.fetchFn(SCHEDULE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`Schedule page returned ${res.status}`);

        const html = await res.text();
        const now = ZonedDateTime.now(TIMEZONE);
        const parsed = this.parseSchedule(html, now);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: parsed.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: parsed.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing
    parseSchedule(html: string, now: ZonedDateTime): Array<RipperCalendarEvent | RipperError> {
        const results: Array<RipperCalendarEvent | RipperError> = [];

        // Match all GameContainer divs that are HomeGame (include both Upcoming and Completed)
        const gameContainerPattern = /<div class="GameContainer[^"]*HomeGame[^"]*">([\s\S]*?)<\/div>\s*<!--END/g;
        let match;
        while ((match = gameContainerPattern.exec(html)) !== null) {
            const containerHtml = match[1];
            const result = this.parseGameContainer(containerHtml, now);
            results.push(result);
        }

        return results;
    }

    // Public for testing
    parseGameContainer(containerHtml: string, now: ZonedDateTime): RipperCalendarEvent | RipperError {
        // Extract OpponentName
        const opponentMatch = containerHtml.match(/<div class="OpponentName">\s*(.*?)\s*<\/div>/);
        if (!opponentMatch) {
            return { type: 'ParseError', reason: 'Missing OpponentName', context: containerHtml.slice(0, 200) };
        }
        const opponentName = opponentMatch[1].trim();

        // Extract GameDate
        const gameDateMatch = containerHtml.match(/<div class="GameDate">\s*(.*?)\s*<\/div>/);
        if (!gameDateMatch) {
            return { type: 'ParseError', reason: 'Missing GameDate', context: containerHtml.slice(0, 200) };
        }
        const gameDateText = gameDateMatch[1].trim();

        // Extract GameTime
        const gameTimeMatch = containerHtml.match(/<div class="GameTime">\s*(.*?)\s*<\/div>/);
        if (!gameTimeMatch) {
            return { type: 'ParseError', reason: 'Missing GameTime', context: containerHtml.slice(0, 200) };
        }
        const gameTimeText = gameTimeMatch[1].trim();

        const parsedDate = this.parseGameDate(gameDateText);
        if (!parsedDate) {
            return { type: 'ParseError', reason: `Could not parse GameDate: "${gameDateText}"`, context: containerHtml.slice(0, 200) };
        }

        const parsedTime = this.parseGameTime(gameTimeText);
        if (!parsedTime) {
            return { type: 'ParseError', reason: `Could not parse GameTime: "${gameTimeText}"`, context: containerHtml.slice(0, 200) };
        }

        const { month, day } = parsedDate;
        const { hour, minute } = parsedTime;

        const curYear = now.year();
        let eventDate = ZonedDateTime.of(
            LocalDateTime.of(curYear, month, day, hour, minute),
            TIMEZONE
        );
        // If event is in the past, try next year
        if (eventDate.isBefore(now)) {
            eventDate = ZonedDateTime.of(
                LocalDateTime.of(curYear + 1, month, day, hour, minute),
                TIMEZONE
            );
        }

        const dateStr = `${eventDate.year()}-${String(eventDate.monthValue()).padStart(2, '0')}-${String(eventDate.dayOfMonth()).padStart(2, '0')}`;
        const id = `ballard-fc-${dateStr}`;
        const summary = `Ballard FC ${opponentName}`;

        return {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofHours(DEFAULT_DURATION_HOURS),
            summary,
            location: LOCATION,
            url: SCHEDULE_URL,
        };
    }

    // Public for testing — parse "Friday, May 29" or "Saturday, June 6"
    parseGameDate(text: string): ParsedGameDate | null {
        // Format: "DayOfWeek, Month Day" (e.g., "Friday, May 29")
        const clean = text.replace(/\s+/g, ' ').trim();
        // Split on comma to separate day-of-week from month+day
        const commaParts = clean.split(',');
        if (commaParts.length < 2) return null;

        const monthDayPart = commaParts[1].trim();
        const parts = monthDayPart.split(/\s+/);
        if (parts.length < 2) return null;

        const monthName = parts[0].toLowerCase();
        let month = MONTH_NAMES[monthName];
        if (!month) {
            // Try prefix match for abbreviated month names
            const full = Object.keys(MONTH_NAMES).find(k => k.startsWith(monthName));
            if (full) month = MONTH_NAMES[full];
        }
        if (!month) return null;

        const day = parseInt(parts[1], 10);
        if (isNaN(day)) return null;

        return { month, day };
    }

    // Public for testing — parse "7:00 PM" or "2:00 PM"
    parseGameTime(text: string): ParsedGameTime | null {
        const clean = text.replace(/\s+/g, ' ').trim();
        // Format: "H:MM AM/PM" or "H:MM am/pm"
        const timeMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!timeMatch) return null;

        let hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3].toUpperCase();

        if (ampm === 'PM' && hour !== 12) hour += 12;
        else if (ampm === 'AM' && hour === 12) hour = 0;

        return { hour, minute };
    }
}
