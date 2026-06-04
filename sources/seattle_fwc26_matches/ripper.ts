import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse, HTMLElement } from "node-html-parser";
import '@js-joda/timezone';

// The official Seattle host-committee site renders all six Lumen Field
// (a.k.a. "Seattle Stadium" during the tournament) matches server-side as
// `.matches_citem` cards on /matches, so node-html-parser can read them
// without executing JavaScript. Knockout matchups that are still TBD show
// placeholder codes (e.g. "1G", "3AEHIJ", "W81") that this ripper humanizes
// and that resolve automatically on the next build as the bracket fills in.
const BASE_URL = "https://www.seattlefwc26.org";
const MATCHES_PATH = "/matches";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const LOCATION = "Lumen Field, 800 Occidental Ave S, Seattle, WA 98134";
// World Cup matches run ~2 hours including halftime and stoppage time.
const MATCH_DURATION = Duration.ofHours(2);

const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export default class SeattleFwc26MatchesRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const url = `${BASE_URL}${MATCHES_PATH}`;
        const res = await this.fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) {
            throw new Error(`${url} returned HTTP ${res.status}`);
        }
        const html = await res.text();
        const results = this.parseMatches(html, url);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: results.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: results.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    parseMatches(html: string, sourceUrl: string): RipperEvent[] {
        const root = parse(html);
        const items = root.querySelectorAll('.matches_citem');
        const results: RipperEvent[] = [];
        for (const item of items) {
            results.push(this.parseMatchItem(item, sourceUrl));
        }
        return results;
    }

    parseMatchItem(item: HTMLElement, sourceUrl: string): RipperCalendarEvent | RipperError {
        // `.match_date` holds the match label ("Match 16"), then a separator,
        // then the `.match_date-time` block with the date and kickoff time.
        const dateEl = item.querySelector('.match_date');
        const matchLabel = dateEl?.querySelector('div')?.text.trim() ?? '';

        const dateTimeEl = item.querySelector('.match_date-time');
        const dateText = dateTimeEl?.querySelector('div')?.text.trim() ?? '';
        const parsedDate = parseMatchDate(dateText);
        if (!parsedDate) {
            return {
                type: 'ParseError',
                reason: `Could not parse match date from "${dateText}"`,
                context: matchLabel || sourceUrl,
            };
        }

        const timeDivs = item.querySelectorAll('.match_time-zone div');
        const timeText = timeDivs[0]?.text.trim() ?? '';
        const parsedTime = parseMatchTime(timeText);
        if (!parsedTime) {
            return {
                type: 'ParseError',
                reason: `Could not parse kickoff time from "${timeText}"`,
                context: matchLabel || sourceUrl,
            };
        }

        const team1 = visibleTeamName(item.querySelector('.match_team.is-1'));
        const team2 = visibleTeamName(item.querySelector('.match_team.is-2'));
        if (!team1 || !team2) {
            return {
                type: 'ParseError',
                reason: `Could not parse teams for ${matchLabel || 'match'}`,
                context: matchLabel || sourceUrl,
            };
        }

        const startLdt = LocalDateTime.of(
            parsedDate.year, parsedDate.month, parsedDate.day,
            parsedTime.hour, parsedTime.minute,
        );
        const date = ZonedDateTime.of(startLdt, TIMEZONE);

        const home = humanizeTeam(team1);
        const away = humanizeTeam(team2);
        const knockout = isPlaceholderTeam(team1) || isPlaceholderTeam(team2);

        const summary = `FIFA World Cup 26: ${home} vs ${away}`;
        const descriptionParts = [`${matchLabel} of the FIFA World Cup 26 at Seattle Stadium (Lumen Field).`];
        if (knockout) {
            descriptionParts.push('Knockout-stage match — the matchup is confirmed once the bracket is set.');
        }

        // Match number is stable even as TBD matchups resolve, so derive the id
        // from it rather than from the (changeable) team names.
        const id = matchLabel
            ? `seattle-fwc26-${slugify(matchLabel)}`
            : `seattle-fwc26-${parsedDate.year}-${parsedDate.month}-${parsedDate.day}`;

        return {
            id,
            ripped: new Date(),
            date,
            duration: MATCH_DURATION,
            summary,
            description: descriptionParts.join('\n\n'),
            location: LOCATION,
            url: sourceUrl,
        };
    }
}

// Within a `.match_team`, the determined team's `.match_team-name` is visible
// and a sibling `.match_team-name.w-condition-invisible` holds the "TBD"
// placeholder. Return the first name that is not the hidden placeholder.
function visibleTeamName(team: HTMLElement | null): string | undefined {
    if (!team) return undefined;
    for (const el of team.querySelectorAll('.match_team-name')) {
        if (el.classList.contains('w-condition-invisible')) continue;
        const text = el.text.trim();
        if (text) return text;
    }
    return undefined;
}

interface ParsedDate {
    year: number;
    month: number;
    day: number;
}

// Parses "June 15, 2026" -> { year: 2026, month: 6, day: 15 }.
export function parseMatchDate(text: string): ParsedDate | null {
    const m = text.match(/(\w+)\s+(\d{1,2}),\s*(\d{4})/);
    if (!m) return null;
    const month = MONTHS[m[1].toLowerCase()];
    if (!month) return null;
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (day < 1 || day > 31) return null;
    return { year, month, day };
}

interface ParsedTime {
    hour: number;
    minute: number;
}

// Parses "12:00 pm" / "8:00 pm" -> 24-hour { hour, minute }.
export function parseMatchTime(text: string): ParsedTime | null {
    const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!m) return null;
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2] ?? '0', 10);
    const ampm = m[3].toLowerCase();
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
}

// A determined team name is a country (e.g. "Belgium"). Knockout slots that
// aren't decided yet show codes like "1G", "3AEHIJ", "W81", "W82".
export function isPlaceholderTeam(name: string): boolean {
    return /^W\d+$/i.test(name) || /^\d[A-Z]+$/i.test(name);
}

// Turn FIFA bracket codes into readable text, falling back to the raw value:
//   "W81"    -> "Winner Match 81"
//   "1G"     -> "Winner Group G"
//   "2G"     -> "Runner-up Group G"
//   "3AEHIJ" -> "3rd Place Group A/E/H/I/J"
export function humanizeTeam(name: string): string {
    const trimmed = name.trim();
    const winnerMatch = trimmed.match(/^W(\d+)$/i);
    if (winnerMatch) return `Winner Match ${winnerMatch[1]}`;

    const groupCode = trimmed.match(/^(\d)([A-Z]+)$/i);
    if (groupCode) {
        const rank = parseInt(groupCode[1], 10);
        const groups = groupCode[2].toUpperCase().split('').join('/');
        const groupLabel = `Group ${groups}`;
        if (rank === 1) return `Winner ${groupLabel}`;
        if (rank === 2) return `Runner-up ${groupLabel}`;
        return `${ordinal(rank)} Place ${groupLabel}`;
    }

    return trimmed;
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
