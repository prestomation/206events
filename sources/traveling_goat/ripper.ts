import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION = "The Traveling Goat, 621 1/2 Queen Anne Ave N, Seattle, WA 98109";
// Fallback only — rip() passes the real zone from ripper.yaml's calendar config.
const DEFAULT_TIMEZONE = ZoneId.of("America/Los_Angeles");

// The site never states an end time — only a start time (sometimes). A
// typical bar event (trivia, live music) runs a couple of hours.
const DEFAULT_DURATION = Duration.ofHours(2);

// Used only when a listing gives no start time at all (see "Negroni Week"
// in sample-data.html — a themed-week promo with no specific start time).
// 7pm matches this venue's own opening hour and its trivia/live-music start
// times, so it's a reasonable placeholder while the event-uncertainty-
// resolver skill fills in the real value.
const DEFAULT_UNKNOWN_HOUR = 19;
const DEFAULT_UNKNOWN_MINUTE = 0;

const MONTH_ABBR: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Matches the page's per-event date line, e.g. "Sep 14, 2026" or
// "October 1, 2026". Always a single day — even the "Negroni Week" promo,
// which spans several days in its *title* ("Sept 21-27"), carries a single
// start date here.
const DATE_RE = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})$/;

// Matches a start time at the end of an event title, e.g. "@ 7p", "@7p",
// "@ 730p", "Guess What? Trivia! 7p" (the "@" is usually but not always
// present). Anchored to the end of the string so it doesn't match a
// stray number earlier in the title (e.g. "Youth Class Level 2").
const TIME_RE = /(\d{1,4})\s*([ap])\.?m?\.?\s*$/i;

export default class TravelingGoatRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const url = ripper.config.url.href;

        const res = await this.fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error(`Events page returned HTTP ${res.status}`);
        const html = await res.text();

        const timezone = ZoneId.of(calConfig.timezone.toString());
        const events = this.parseEventsFromHtml(html, url, timezone);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    // Public for testing. The events page is a hand-authored Wix layout, not
    // a calendar plugin — there's no semantic event markup (no schema.org,
    // no stable component ids; Wix's own component ids/classes are opaque
    // per-publish hashes). What *is* stable is the page's own font-style
    // classes: each event renders as three consecutive rich-text blocks in
    // document order — a "font_8" date line, a "font_2" title, then a
    // "font_8" description — repeated once per event under the "upcoming
    // events" heading. We walk those blocks in order and group them into
    // (date, title, description) triples rather than trying to select a
    // per-event container element.
    // `timezone` defaults to America/Los_Angeles so existing call sites/tests
    // that don't care about DST edge cases keep working; rip() always passes
    // the calendar's configured zone explicitly.
    //
    // Note on selector fragility: this queries the whole document for these
    // two font-style classes rather than scoping to an events container,
    // since no stable container id/class exists on this Wix page. If Wix
    // reuses "font_2"/"font_8" elsewhere on this page in a future redesign,
    // unrelated text could get misgrouped into a fake event — check here
    // first if garbage events start appearing for this source.
    public parseEventsFromHtml(html: string, sourceUrl: string, timezone: ZoneId = DEFAULT_TIMEZONE): RipperEvent[] {
        const root = parse(html);
        const blocks = root.querySelectorAll('h2.font_2, p.font_8');

        const items: { isDate: boolean; text: string }[] = [];
        for (const el of blocks) {
            const text = decode(el.text).replace(/\s+/g, ' ').trim();
            if (!text) continue;
            items.push({ isDate: DATE_RE.test(text), text });
        }

        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        for (let i = 0; i < items.length; i++) {
            if (!items[i].isDate) continue;
            const dateText = items[i].text;
            const title = items[i + 1]?.text;
            if (!title) continue; // trailing date with nothing after it (shouldn't happen)
            const description = items[i + 2]?.text;

            const localDate = this.parseDate(dateText);
            if (!localDate) {
                events.push({ type: 'ParseError', reason: `Could not parse date "${dateText}"`, context: title });
                continue;
            }

            const time = this.parseTimeFromTitle(title);
            const hour = time?.hour ?? DEFAULT_UNKNOWN_HOUR;
            const minute = time?.minute ?? DEFAULT_UNKNOWN_MINUTE;
            const date = ZonedDateTime.of(
                localDate.year(), localDate.monthValue(), localDate.dayOfMonth(),
                hour, minute, 0, 0, timezone,
            );

            const id = this.generateEventId(title, localDate);
            // The weekly trivia night reuses the same title every week — dedup
            // on id (title+date), not on title alone, so each week still gets
            // its own event.
            if (seen.has(id)) continue;
            seen.add(id);

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                date,
                duration: DEFAULT_DURATION,
                summary: title,
                description: description ?? '',
                location: LOCATION,
                url: sourceUrl,
            };
            events.push(event);

            if (!time) {
                events.push({
                    type: 'Uncertainty',
                    reason: `No start time found in title "${title}" (date line: "${dateText}")`,
                    source: 'traveling-goat',
                    unknownFields: ['startTime'],
                    event,
                    partialFingerprint: `${title}|${dateText}`,
                });
            }
        }

        return events;
    }

    // Public for testing.
    public parseDate(text: string): LocalDate | null {
        const m = text.match(DATE_RE);
        if (!m) return null;
        const month = MONTH_ABBR[m[1].slice(0, 3).toLowerCase()];
        if (!month) return null;
        const day = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        try {
            return LocalDate.of(year, month, day);
        } catch {
            return null;
        }
    }

    // Public for testing. Returns null when the title has no "@ <time><ap>m"
    // marker at all (e.g. the "Negroni Week" promo) — the caller treats that
    // as an unknown start time rather than guessing silently.
    public parseTimeFromTitle(title: string): { hour: number; minute: number } | null {
        const m = title.match(TIME_RE);
        if (!m) return null;

        const digits = m[1];
        let hour: number;
        let minute: number;
        if (digits.length <= 2) {
            hour = parseInt(digits, 10);
            minute = 0;
        } else if (digits.length === 3) {
            hour = parseInt(digits.slice(0, 1), 10);
            minute = parseInt(digits.slice(1), 10);
        } else {
            hour = parseInt(digits.slice(0, 2), 10);
            minute = parseInt(digits.slice(2), 10);
        }
        if (hour < 1 || hour > 12 || minute > 59) return null;

        const isPm = m[2].toLowerCase() === 'p';
        if (isPm && hour !== 12) hour += 12;
        else if (!isPm && hour === 12) hour = 0;
        return { hour, minute };
    }

    // Stable id derived purely from source content (title + date) — no
    // timestamps, no array indices. See AGENTS.md "Ripper Design: Stable
    // Event IDs".
    private generateEventId(title: string, date: LocalDate): string {
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `${slug}-${date.toString()}`;
    }
}
