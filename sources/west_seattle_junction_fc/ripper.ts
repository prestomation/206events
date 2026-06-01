import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const LOCATION = "Nino Cantu SW Athletic Complex, Seattle, WA 98146";
const TIMEZONE = ZoneId.of('America/Los_Angeles');
const DEFAULT_DURATION_HOURS = 2;
const SCHEDULE_URL = "https://www.wsjunctionfc.club/2026-schedule/";

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

export default class WestSeattleJunctionFCRipper implements IRipper {
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
        const gameContainerPattern = /GameContainer HomeGame([\s\S]*?)(?=GameContainer|$)/g;

        let match;
        while ((match = gameContainerPattern.exec(html)) !== null) {
            const block = match[1];

            // Pre-filter: skip completed games (h5[3] text starts with "FULLTIME")
            const h5Texts = this.extractH5Texts(block);
            if (h5Texts[3]?.startsWith('FULLTIME')) continue;

            results.push(this.parseHomeGame(block, now));
        }

        return results;
    }

    private extractH5Texts(block: string): string[] {
        const matches = [...block.matchAll(/<h5[^>]*>([\s\S]*?)<\/h5>/g)];
        return matches.map(m => m[1].replace(/<[^>]+>/g, '').replace(/&#8211;/g, '–').trim());
    }

    // Public for testing
    parseHomeGame(block: string, now: ZonedDateTime): RipperCalendarEvent | RipperError {
        const h3Match = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
        if (!h3Match) return { type: 'ParseError', reason: 'Missing date h3', context: block.slice(0, 200) };
        const dateText = h3Match[1].replace(/<[^>]+>/g, '').trim();

        const h5Texts = this.extractH5Texts(block);
        if (h5Texts.length < 4) {
            return { type: 'ParseError', reason: `Expected 4 h5 elements, got ${h5Texts.length}`, context: h5Texts.join(' | ') };
        }

        const opponent = h5Texts[2];
        const timeVenueText = h5Texts[3];

        // Parse time from "H:MM PM | Nino Cantu Memorial Stadium"
        const timeMatch = timeVenueText.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        if (!timeMatch) {
            return { type: 'ParseError', reason: `Could not parse time from "${timeVenueText}"`, context: dateText };
        }

        const parsedDate = this.parseGameDate(dateText);
        if (!parsedDate) {
            return { type: 'ParseError', reason: `Could not parse date: "${dateText}"`, context: dateText };
        }

        const parsedTime = this.parseGameTime(timeMatch[1]);
        if (!parsedTime) {
            return { type: 'ParseError', reason: `Could not parse time: "${timeMatch[1]}"`, context: dateText };
        }

        const { month, day } = parsedDate;
        const { hour, minute } = parsedTime;

        const curYear = now.year();
        let eventDate = ZonedDateTime.of(
            LocalDateTime.of(curYear, month, day, hour, minute),
            TIMEZONE
        );
        if (eventDate.isBefore(now)) {
            eventDate = ZonedDateTime.of(
                LocalDateTime.of(curYear + 1, month, day, hour, minute),
                TIMEZONE
            );
        }

        const dateStr = `${eventDate.year()}-${String(eventDate.monthValue()).padStart(2, '0')}-${String(eventDate.dayOfMonth()).padStart(2, '0')}`;
        const id = `west-seattle-junction-fc-${dateStr}`;

        return {
            id,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofHours(DEFAULT_DURATION_HOURS),
            summary: `West Seattle Junction FC vs ${opponent}`,
            location: LOCATION,
            url: SCHEDULE_URL,
        };
    }

    // Public for testing
    parseGameDate(text: string): ParsedGameDate | null {
        const clean = text.replace(/\s+/g, ' ').trim();
        const commaParts = clean.split(',');
        if (commaParts.length < 2) return null;

        const monthDayPart = commaParts[1].trim();
        const parts = monthDayPart.split(/\s+/);
        if (parts.length < 2) return null;

        const monthName = parts[0].toLowerCase();
        let month = MONTH_NAMES[monthName];
        if (!month) {
            const full = Object.keys(MONTH_NAMES).find(k => k.startsWith(monthName));
            if (full) month = MONTH_NAMES[full];
        }
        if (!month) return null;

        const day = parseInt(parts[1], 10);
        if (isNaN(day)) return null;

        return { month, day };
    }

    // Public for testing
    parseGameTime(text: string): ParsedGameTime | null {
        const clean = text.replace(/\s+/g, ' ').trim();
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
