import { HTMLRipper } from "../../lib/config/htmlscrapper.js";
import { HTMLElement, parse } from 'node-html-parser';
import { ZonedDateTime, Duration, ZoneId, LocalDate } from "@js-joda/core";
import { EventCost, Ripper, RipperCalendar, RipperEvent, RipperCalendarEvent, UncertaintyError, UncertaintyField } from "../../lib/config/schema.js";
import { decode } from "html-entities";

// events12.com rarely lists explicit start times. When a time isn't
// known we still emit an event so it shows up on the calendar (using
// these placeholders), and the infrastructure layer pairs it with an
// UncertaintyError so the event-uncertainty-resolver skill can fill in
// the real time on a later build. See docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 12;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_UNKNOWN_DURATION = Duration.ofHours(2);

interface ParsedTime {
    hour: number;
    minute: number;
    duration: Duration;
}

interface ParsedDates {
    // One entry per (day × time-slot) occurrence the source page lists.
    // `title`/`timeUnknown` per-occurrence overrides are used by
    // parseScheduleTable (a table row's own opponent/artist and known time
    // take precedence over the article-level title and the shared
    // timeUnknown flag below).
    occurrences: { date: ZonedDateTime; duration: Duration; slot: string | null; title?: string; timeUnknown?: boolean }[];
    // True when the source page gave no explicit time — emit
    // UncertaintyError for the slots below (unless a slot overrides it).
    timeUnknown: boolean;
    // Days covered by the source's date range (used for reasoning about
    // how many events get expanded).
    dayCount: number;
}

// One row of a per-occurrence schedule table (see parseScheduleTable).
interface ScheduleRow {
    date: LocalDate;
    // null when the row's time cell couldn't be parsed (e.g. "TBD") — the
    // occurrence still gets emitted with a placeholder time and flagged
    // uncertain, same as the generic date-range path.
    time: ParsedTime | null;
    label: string;
}

export default class Events12Ripper extends HTMLRipper {
    private seenEvents = new Set<string>();
    private rawHtml = '';

    // events12.com's own "current month" listing pages have been observed
    // serving weeks-stale content (e.g. still showing "July 1-6" listings
    // when fetched in late July) rather than rolling forward as the site's
    // own copy claims. parseEvents() has no "now" concept — its unit tests
    // deliberately construct occurrences before an arbitrary fixed testDate
    // to exercise date-range expansion — so filtering belongs here, in the
    // production rip() path, using the real wall-clock instant rather than
    // whatever day parseEvents was invoked for.
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars = await super.rip(ripper);
        const now = ZonedDateTime.now();

        return calendars.map(cal => {
            const events = cal.events.filter(e => !e.date.isBefore(now));
            const keptIds = new Set(events.map(e => e.id));
            const errors = cal.errors.filter(err =>
                err.type !== "Uncertainty" || keptIds.has(err.event.id),
            );
            return { ...cal, events, errors };
        });
    }

    protected preprocessHtml(html: string): string {
        // Store raw HTML so parseEvents can extract articles via regex.
        // events12.com uses unclosed <p>, <td>, and <li> tags inside articles
        // that contain tables. When node-html-parser processes the full
        // document, these cause cascading nesting that swallows articles
        // (especially those near the bottom). Parsing each article individually
        // avoids this problem entirely.
        this.rawHtml = html;
        return html;
    }

    public async parseEvents(html: HTMLElement, date: ZonedDateTime, config: any): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];

        // Extract each article via regex and parse individually to avoid
        // node-html-parser nesting issues with the full document.
        const articleRegex = /<article\s[^>]*id="[^"]*"[^>]*>[\s\S]*?<\/article>/g;
        const source = this.rawHtml || html.outerHTML;
        let match;

        while ((match = articleRegex.exec(source)) !== null) {
            // Guard against zero-length matches to prevent infinite loops
            if (match[0].length === 0) {
                articleRegex.lastIndex++;
                continue;
            }
            try {
                const article = parse(match[0]);

                // Get the event title from the H3 element
                const titleElement = article.querySelector('h3');
                if (!titleElement) continue;

                // The article's numeric id (e.g. <article id="113825">) is the
                // basis of its per-event image filename (e.g. /img/113825b.jpg).
                const articleId = match[0].match(/<article\s[^>]*id="([^"]*)"/)?.[1] ?? '';
                const imageUrl = this.extractImageUrl(article, articleId);

                // Detect free events via <span class="free">FREE</span> in the title.
                // Detect ticketed events via <a class="b2">tickets</a> anywhere in the article.
                const isFree = titleElement.querySelector('.free') !== null;
                const isTicketed = article.querySelector('a.b2') !== null;
                const cost: EventCost | undefined = isFree ? { min: 0 } : isTicketed ? { paid: true } : undefined;

                const title = titleElement.text.trim().replace(/\s*FREE\s*$/, '').trim();
                if (!title) continue;

                let location = '';
                let description = '';
                let url = '';

                // Find date element
                const dateElement = article.querySelector('p.date');
                if (!dateElement) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not find date element`,
                        context: title,
                    });
                    continue;
                }
                const dateText = dateElement.text.trim();

                // Season/series listings (Football, Baseball, Soccer,
                // Basketball, ZooTunes, winery concerts, ...) give a
                // season-long range in the header (e.g. "August 15 - Dec.
                // 25, 2026") but list the real per-occurrence dates/times in
                // an embedded table. Prefer that over expanding the header
                // range into one placeholder event per calendar day.
                const schedule = this.parseScheduleTable(match[0], extractYear(dateText) ?? date.year());
                const parsed = schedule
                    ? this.scheduleToParsedDates(schedule, title, date.zone())
                    : this.parseDateField(dateText, date.zone());

                // Find location element and map link
                const locationElement = article.querySelector('p.miles');
                const mapLink = article.querySelector('a[href*="google.com/maps"]');
                if (locationElement) {
                    const locationText = locationElement.text.trim();
                    if (mapLink) {
                        // Extract the precise address from the Google Maps query param
                        // (e.g. query=Seattle+Convention+Center%2C+705+Pike+St%2C+Seattle+WA)
                        // rather than storing the raw URL as the event location.
                        const href = mapLink.getAttribute('href') || '';
                        try {
                            const queryParam = new URL(href).searchParams.get('query');
                            location = queryParam ?? locationText;
                        } catch {
                            location = locationText;
                        }
                        description = locationText + '\n\n';
                    } else {
                        location = locationText;
                    }
                }

                // Find description element
                const descElement = article.querySelector('p.event');
                if (descElement) {
                    description += descElement.text.trim();
                }

                // Find event URL
                const links = article.querySelectorAll('a');
                for (const link of links) {
                    const href = link.getAttribute('href');
                    if (href && !href.includes('google.com/maps') && !href.includes('facebook.com') && !href.includes('youtube.com')) {
                        url = href.startsWith('http') ? href : `https://www.events12.com${href}`;
                        break;
                    }
                }

                if (!parsed || (parsed.occurrences.length === 0 && !schedule)) {
                    events.push({
                        type: "ParseError",
                        reason: `Could not parse event date`,
                        context: `${title} — "${dateText}"`,
                    });
                    continue;
                }
                // A schedule table with zero remaining occurrences (e.g. the
                // rest of the season is away games, which don't belong on a
                // Seattle calendar) is not a parse gap — just nothing to emit.
                if (parsed.occurrences.length === 0) continue;

                // Fingerprint the parsed data so cache entries are invalidated
                // if the source page changes (e.g., upstream later adds a
                // start time). Includes title + end-date + timeUnknown so
                // both "the run got shorter" and "they finally posted a time"
                // bust the cache.
                const fingerprint = this.fingerprint(title, parsed);

                for (const { date: d, duration: dur, slot, title: occTitle, timeUnknown: occTimeUnknown } of parsed.occurrences) {
                    const eventTitle = occTitle ?? title;
                    const eventId = this.generateEventId(eventTitle, d, slot);

                    // Skip if we've already seen this event in this rip
                    if (this.seenEvents.has(eventId)) continue;
                    this.seenEvents.add(eventId);

                    const event: RipperCalendarEvent = {
                        id: eventId,
                        ripped: new Date(),
                        date: d,
                        duration: dur,
                        summary: eventTitle,
                        description: description,
                        location: location,
                        url: url || undefined,
                        imageUrl,
                        ...(cost ? { cost } : {}),
                    };
                    events.push(event);

                    const timeUnknown = occTimeUnknown ?? parsed.timeUnknown;
                    const costUnknown = cost === undefined;
                    if (timeUnknown || costUnknown) {
                        const unknownFields: UncertaintyField[] = [];
                        if (timeUnknown) unknownFields.push("startTime", "duration");
                        if (costUnknown) unknownFields.push("cost");
                        events.push({
                            type: "Uncertainty",
                            reason: parsed.timeUnknown
                                ? `events12 listing did not include a start time (raw: "${dateText}")`
                                : "events12 listing did not include cost information",
                            source: "events12",
                            unknownFields,
                            event,
                            partialFingerprint: fingerprint,
                        });
                    }
                }

            } catch (error) {
                events.push({
                    type: "ParseError",
                    reason: `Failed to parse event: ${error}`,
                    context: match[0].substring(0, 100),
                });
            }
        }

        return events;
    }

    // Extract the per-event flyer image from an events12 article. Each event's
    // image lives in an <img src="/img/<articleId>...jpg"> inside the article;
    // we require the filename to start with the article id so we never pick up a
    // shared category banner (those live in <h2>-only blocks the ripper skips).
    // Returns an absolute URL, or undefined when the article has no image.
    public extractImageUrl(article: HTMLElement, articleId: string): string | undefined {
        if (!articleId) return undefined;
        const imgs = article.querySelectorAll('img');
        for (const img of imgs) {
            const src = img.getAttribute('src')?.trim();
            if (!src) continue;
            const filename = src.split('/').pop() ?? '';
            if (!filename.startsWith(articleId)) continue;
            if (/^https?:\/\//i.test(src)) return src;
            if (src.startsWith('//')) return `https:${src}`;
            if (src.startsWith('/')) return `https://www.events12.com${src}`;
            return undefined;
        }
        return undefined;
    }

    // Parse the events12 date-line text into a fully-expanded list of
    // (day × time-slot) occurrences. Handles:
    //   - "December 3, 2025 (7 to 8:30 p.m.)"      — single day, single slot
    //   - "January 1 - 11, 2026"                    — multi-day, no time
    //   - "January 1 - Dec. 31, 2026 (4:30 to 10 p.m.)" — multi-day, single slot
    //   - "February 21 & 28, 2026 (8 to 10 p.m.)"  — listed days, single slot
    //   - "February 12 - 15, 2026 (5 & 8 p.m.)"    — multi-day, multi slot
    private parseDateField(dateText: string, timezone: ZoneId): ParsedDates | null {
        const days = this.parseDayList(dateText);
        if (days.length === 0) return null;

        const times = this.parseTimeList(dateText);
        const timeUnknown = times.length === 0;
        const slots: ParsedTime[] = timeUnknown
            ? [{
                hour: DEFAULT_UNKNOWN_TIME_HOUR,
                minute: DEFAULT_UNKNOWN_TIME_MINUTE,
                duration: DEFAULT_UNKNOWN_DURATION,
              }]
            : times;

        const occurrences: ParsedDates['occurrences'] = [];
        for (const day of days) {
            for (const t of slots) {
                const d = ZonedDateTime.of(day.year(), day.monthValue(), day.dayOfMonth(), t.hour, t.minute, 0, 0, timezone);
                const slot = slots.length > 1
                    ? `${String(t.hour).padStart(2, '0')}${String(t.minute).padStart(2, '0')}`
                    : null;
                occurrences.push({ date: d, duration: t.duration, slot });
            }
        }
        return { occurrences, timeUnknown, dayCount: days.length };
    }

    // Expand the date portion of the text into one LocalDate per day.
    // Handles single days, hyphen-separated ranges (same-month or cross-
    // month), and the "& day" listed-day pattern.
    private parseDayList(dateText: string): LocalDate[] {
        // "Month Day1 & Day2, Year" — two separate occurrences of the same date
        const ampersandMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*&\s*(\d{1,2}),?\s+(\d{4})/
        );
        if (ampersandMatch) {
            const month = monthMap[ampersandMatch[1]];
            const day1 = parseInt(ampersandMatch[2], 10);
            const day2 = parseInt(ampersandMatch[3], 10);
            const year = parseInt(ampersandMatch[4], 10);
            if (!month) return [];
            return [LocalDate.of(year, month, day1), LocalDate.of(year, month, day2)];
        }

        // "Month Day1 - Month Day2, Year" — cross-month range (e.g.
        // "January 1 - Dec. 31, 2026"). The trailing ", YYYY" applies
        // to both ends.
        const crossMonthMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/
        );
        if (crossMonthMatch) {
            const startMonthName = crossMonthMatch[1];
            const startDay = parseInt(crossMonthMatch[2], 10);
            const endMonthName = expandMonthName(crossMonthMatch[3]);
            const endDay = parseInt(crossMonthMatch[4], 10);
            const year = parseInt(crossMonthMatch[5], 10);
            const startMonth = monthMap[startMonthName];
            const endMonth = endMonthName ? monthMap[endMonthName] : undefined;
            if (!startMonth || !endMonth) return [];
            const start = LocalDate.of(year, startMonth, startDay);
            const end = LocalDate.of(year, endMonth, endDay);
            return expandRange(start, end);
        }

        // "Month Day1 - Day2, Year" — same-month range
        const sameMonthRangeMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})/
        );
        if (sameMonthRangeMatch) {
            const month = monthMap[sameMonthRangeMatch[1]];
            const startDay = parseInt(sameMonthRangeMatch[2], 10);
            const endDay = parseInt(sameMonthRangeMatch[3], 10);
            const year = parseInt(sameMonthRangeMatch[4], 10);
            if (!month) return [];
            return expandRange(LocalDate.of(year, month, startDay), LocalDate.of(year, month, endDay));
        }

        // Single day
        const singleMatch = dateText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/
        );
        if (singleMatch) {
            const month = monthMap[singleMatch[1]];
            const day = parseInt(singleMatch[2], 10);
            const year = parseInt(singleMatch[3], 10);
            if (!month) return [];
            return [LocalDate.of(year, month, day)];
        }

        return [];
    }

    // Parse the parenthesized time portion. Returns one ParsedTime per
    // distinct slot the listing exposes:
    //   "(7 p.m.)"               → 1 entry
    //   "(4 to 7 p.m.)"          → 1 entry, 3h duration
    //   "(5 & 8 p.m.)"           → 2 entries
    //   "(noon)"                 → 1 entry
    // Returns [] when no parenthesized time is present (the caller treats
    // this as "time unknown" rather than an error).
    private parseTimeList(dateText: string): ParsedTime[] {
        // "(5 & 8 p.m.)" — two same-meridiem showings on each day
        const ampersandTimeMatch = dateText.match(
            /\((\d{1,2})(?::(\d{2}))?\s*&\s*(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
        );
        if (ampersandTimeMatch) {
            const ampm = ampersandTimeMatch[5];
            return [
                {
                    hour: this.convertTo24Hour(parseInt(ampersandTimeMatch[1], 10), ampm),
                    minute: ampersandTimeMatch[2] ? parseInt(ampersandTimeMatch[2], 10) : 0,
                    duration: DEFAULT_UNKNOWN_DURATION,
                },
                {
                    hour: this.convertTo24Hour(parseInt(ampersandTimeMatch[3], 10), ampm),
                    minute: ampersandTimeMatch[4] ? parseInt(ampersandTimeMatch[4], 10) : 0,
                    duration: DEFAULT_UNKNOWN_DURATION,
                },
            ];
        }

        // Time range: "(4 to 7 p.m.)" or "(9 a.m. to 9 p.m.)" or "(4:30 to 10 p.m.)"
        const rangeMatch = dateText.match(
            /\((\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)?\s*to\s*(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
        );
        if (rangeMatch) {
            const endAmPm = rangeMatch[6];
            const startAmPm = rangeMatch[3] || endAmPm;
            const startHour = this.convertTo24Hour(parseInt(rangeMatch[1], 10), startAmPm);
            const startMinute = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
            const endHour = this.convertTo24Hour(parseInt(rangeMatch[4], 10), endAmPm);
            const endMinute = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;
            const startTotal = startHour * 60 + startMinute;
            const endTotal = endHour * 60 + endMinute;
            const duration = endTotal > startTotal ? Duration.ofMinutes(endTotal - startTotal) : DEFAULT_UNKNOWN_DURATION;
            return [{ hour: startHour, minute: startMinute, duration }];
        }

        // Single time: "(7 p.m.)" or "(7:30 p.m.)"
        const singleMatch = dateText.match(
            /\((\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\)/i
        );
        if (singleMatch) {
            return [{
                hour: this.convertTo24Hour(parseInt(singleMatch[1], 10), singleMatch[3]),
                minute: singleMatch[2] ? parseInt(singleMatch[2], 10) : 0,
                duration: DEFAULT_UNKNOWN_DURATION,
            }];
        }

        if (/\(noon\)/i.test(dateText)) {
            return [{ hour: 12, minute: 0, duration: DEFAULT_UNKNOWN_DURATION }];
        }

        return [];
    }

    // Detects and parses a per-occurrence schedule table embedded in an
    // article — used by team/venue season-schedule listings (Football,
    // Baseball, Soccer, Basketball, ZooTunes, winery concerts, ...) whose
    // <p class="date"> header is a season-long range (e.g. "August 15 -
    // Dec. 25, 2026") that would otherwise expand into one placeholder
    // event per calendar day via parseDateField, even on days with no
    // actual game/show.
    //
    // Returns null when the article has no `table.table1` whose header's
    // first column is literally "Date". events12 uses `table.table1` for a
    // second, unrelated shape too — a multi-venue "Location / Next concert"
    // table (one row per *different* venue's upcoming show, not a single
    // venue's full schedule) — which is intentionally left to the generic
    // date-range path since a table row there isn't "this venue's Nth
    // occurrence."
    //
    // Away games (a "@" marker in the 3rd of 4 columns) are dropped — this
    // is a Seattle events calendar, and an away game isn't a Seattle event.
    // Rows whose date cell is "TBD" or otherwise unparseable are dropped
    // too (no confirmed date to place on a calendar). `isSportsShape`
    // reflects whether data rows have the 4-column [date, time, @, team]
    // shape (sports) vs. the 3-column [date, time, act] shape (concerts) —
    // used by the caller to format the per-row title.
    // Takes the article's *raw* HTML text (not the parsed HTMLElement) and
    // works via regex rather than DOM traversal: node-html-parser silently
    // drops every `<tr>` in this markup (the rows have no closing tags) and
    // mis-splits the last `<td>` of each row, so `querySelectorAll('tr'/'td')`
    // on the parsed tree returns garbage for these tables. The raw text
    // still has clean `<tr ...>` boundaries to split on.
    private parseScheduleTable(articleHtml: string, headerYear: number): { occurrences: ScheduleRow[]; isSportsShape: boolean } | null {
        const tableRegex = /<table\s+class="table1"[^>]*>([\s\S]*?)<\/table>/gi;
        let tableMatch: RegExpExecArray | null;
        while ((tableMatch = tableRegex.exec(articleHtml)) !== null) {
            // Each row's cell content runs from one <tr> up to the next <tr>
            // (or end of table) — reliable even with no closing </tr>.
            const rowSegments = tableMatch[1].split(/<tr[^>]*>/i).slice(1);
            if (rowSegments.length < 2) continue;

            const headerCells = this.extractCells(rowSegments[0]);
            if (headerCells.length === 0 || headerCells[0].toLowerCase() !== 'date') continue;

            const occurrences: ScheduleRow[] = [];
            let isSportsShape = false;
            let year = headerYear;
            let lastMonth = 0;

            for (let i = 1; i < rowSegments.length; i++) {
                const cells = this.extractCells(rowSegments[i]);
                if (cells.length < 3) continue; // footer/nav row (e.g. "show more" links)

                const dateMatch = cells[0].match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
                if (!dateMatch) continue; // "TBD" or unparseable — no confirmed date yet

                const monthName = expandMonthName(dateMatch[1]);
                const month = monthName ? monthMap[monthName] : undefined;
                if (!month) continue;
                if (lastMonth && month < lastMonth) year++; // rolled into the next calendar year
                lastMonth = month;

                const startDay = parseInt(dateMatch[2], 10);
                const endDay = dateMatch[3] ? parseInt(dateMatch[3], 10) : startDay;

                const timeMatch = cells[1].match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
                const time: ParsedTime | null = timeMatch
                    ? {
                        hour: this.convertTo24Hour(parseInt(timeMatch[1], 10), timeMatch[3]),
                        minute: timeMatch[2] ? parseInt(timeMatch[2], 10) : 0,
                        duration: DEFAULT_UNKNOWN_DURATION,
                    }
                    : null;

                const fourColumn = cells.length >= 4;
                if (fourColumn) isSportsShape = true;
                if (fourColumn && cells[2] === '@') continue; // away game

                const label = fourColumn ? cells[3] : cells[2];
                if (!label) continue;

                for (let day = startDay; day <= endDay; day++) {
                    try {
                        occurrences.push({ date: LocalDate.of(year, month, day), time, label });
                    } catch {
                        continue;
                    }
                }
            }
            return { occurrences, isSportsShape };
        }
        return null;
    }

    // Splits one row's raw HTML (from just after its <tr> to the next <tr>
    // or end of table) into cell text, using "up to the next <td or end" as
    // the cell boundary since these <td>s have no closing tags either.
    private extractCells(rowHtml: string): string[] {
        const cells: string[] = [];
        const cellRegex = /<td[^>]*>([\s\S]*?)(?=<td|$)/gi;
        let m: RegExpExecArray | null;
        while ((m = cellRegex.exec(rowHtml)) !== null) {
            const text = decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
            cells.push(text);
        }
        return cells;
    }

    // Converts a parseScheduleTable() result into the same ParsedDates
    // shape the generic date-range path produces, so both feed the same
    // downstream event-emission loop. Each occurrence carries its own
    // title (opponent for sports, act for concerts) and, when the row's
    // time couldn't be parsed, its own timeUnknown override.
    private scheduleToParsedDates(
        schedule: { occurrences: ScheduleRow[]; isSportsShape: boolean },
        title: string,
        timezone: ZoneId,
    ): ParsedDates {
        const occurrences = schedule.occurrences.map(row => {
            const t = row.time ?? {
                hour: DEFAULT_UNKNOWN_TIME_HOUR,
                minute: DEFAULT_UNKNOWN_TIME_MINUTE,
                duration: DEFAULT_UNKNOWN_DURATION,
            };
            const d = ZonedDateTime.of(row.date.year(), row.date.monthValue(), row.date.dayOfMonth(), t.hour, t.minute, 0, 0, timezone);
            const rowTitle = schedule.isSportsShape ? `${title} vs. ${row.label}` : `${title}: ${row.label}`;
            return { date: d, duration: t.duration, slot: null, title: rowTitle, timeUnknown: row.time === null };
        });
        return { occurrences, timeUnknown: false, dayCount: occurrences.length };
    }

    private convertTo24Hour(hour: number, ampm: string | undefined): number {
        if (!ampm) return hour;
        const isPm = ampm.toLowerCase().includes('p');
        const isAm = ampm.toLowerCase().includes('a');
        if (isPm && hour !== 12) return hour + 12;
        if (isAm && hour === 12) return 0;
        return hour;
    }

    // Stable id from source content only (no Date.now / no randomness).
    // Format: <title-slug>-YYYY-MM-DD[-HHMM].  The optional slot keeps
    // multi-showing days (e.g. "5 & 8 p.m.") unique without disturbing
    // ids on single-showing days, which keeps existing cache keys stable.
    private generateEventId(title: string, date: ZonedDateTime, slot: string | null): string {
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const dateStr = date.toLocalDate().toString();
        return slot ? `${titleSlug}-${dateStr}-${slot}` : `${titleSlug}-${dateStr}`;
    }

    // Compact deterministic fingerprint of the parsed source data.
    // Cached resolutions are dropped when this changes — e.g., if
    // upstream later publishes a real time, timeUnknown flips and the
    // old "we guessed noon" resolution is invalidated.
    //
    // NOTE: Previously used dayCount, which changed daily for multi-day events
    // because events12 updates its start date to "today". Using the end date
    // instead, which is stable across builds for the same event.
    private fingerprint(title: string, parsed: ParsedDates): string {
        const titleHash = simpleHash(title);
        const last = parsed.occurrences[parsed.occurrences.length - 1];
        const endDate = last?.date.toLocalDate().toString() ?? '';
        return `${titleHash}-until${endDate}-${parsed.timeUnknown ? 'tu' : 'tk'}`;
    }
}

const monthMap: { [key: string]: number } = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12,
};

// First 4-digit year found in a date-header string (e.g. "August 15 -
// Dec. 25, 2026" → 2026). Used as the starting year for schedule-table row
// dates, which carry no year of their own.
function extractYear(text: string): number | null {
    const m = text.match(/\b(\d{4})\b/);
    return m ? parseInt(m[1], 10) : null;
}

// "Dec" / "Dec." / "December" → "December". Returns undefined for unknown input.
function expandMonthName(raw: string): string | undefined {
    const cleaned = raw.replace(/\./g, '').trim();
    if (monthMap[cleaned] !== undefined) return cleaned;
    const match = Object.keys(monthMap).find(m => m.toLowerCase().startsWith(cleaned.toLowerCase()));
    return match;
}

function expandRange(start: LocalDate, end: LocalDate): LocalDate[] {
    const days: LocalDate[] = [];
    let cursor = start;
    // Bound the expansion so a malformed range can't generate a runaway
    // event list; events12 ranges in practice are at most a few months.
    const HARD_LIMIT = 400;
    let count = 0;
    while (!cursor.isAfter(end) && count < HARD_LIMIT) {
        days.push(cursor);
        cursor = cursor.plusDays(1);
        count++;
    }
    return days;
}

// Cheap deterministic hash; we only need stability, not crypto strength.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
