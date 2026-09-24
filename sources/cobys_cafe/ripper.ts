import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZoneId, ZonedDateTime } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

const LOCATION = "Coby's Cafe, 101 Nickerson St Building B Suite 200, Seattle, WA 98109";
const TIMEZONE = ZoneId.of('America/Los_Angeles');

// Known upstream typos for month names, keyed by the exact lowercased typo'd
// word. An explicit lookup rather than a generic fuzzy/edit-distance
// matcher: a distance-based check would also cross-match ordinary English
// words that happen to sit near a month name in edit-distance space (e.g.
// "Match"/"Marsh" or "Augusta"/"Aprils"), silently misdating an unrelated
// event instead of correctly failing to parse. Add a new entry here only
// for a typo actually observed on the live site.
const MONTH_TYPO_OVERRIDES: Record<string, number> = {
    // "Octotber 2" for "October 2" — https://www.cobyscafe.com/product/x/2Z5TBRBNQU3S6DK4UF7TB447
    octotber: 9,
};

export default class CobysCafeRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];

        const eventIds = await this.fetchFeaturedEventIds(ripper.config.url.href);
        const events = await this.fetchAndParseEvents(eventIds);

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: events.filter((e): e is RipperCalendarEvent => 'date' in e),
            errors: events.filter((e): e is RipperError => 'type' in e),
            tags: calConfig.tags ?? ripper.config.tags ?? [],
            parent: ripper.config
        }];
    }

    private async fetchFeaturedEventIds(eventsUrl: string): Promise<string[]> {
        const res = await this.fetchFn(eventsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`Events page returned ${res.status}`);
        const html = await res.text();
        return this.extractFeaturedEventIds(html);
    }

    extractFeaturedEventIds(html: string): string[] {
        const match = html.match(/"featuredEventIds":\[([^\]]+)\]/);
        if (!match) return [];
        return match[1].replace(/"/g, '').split(',').map(id => id.trim()).filter(Boolean);
    }

    private async fetchAndParseEvents(ids: string[]): Promise<RipperEvent[]> {
        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        for (const id of ids) {
            try {
                const url = `https://www.cobyscafe.com/product/x/${id}`;
                const res = await this.fetchFn(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (!res.ok) {
                    events.push({ type: 'ParseError', reason: `HTTP ${res.status} fetching event ${id}`, context: id });
                    continue;
                }
                const html = await res.text();

                // Pre-parse filter: skip non-event pages and intentionally excluded content
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
                if (titleMatch) {
                    const title = titleMatch[1]
                        .replace(/ \| Coby&#039;s Cafe$/, '')
                        .replace(/ \| Coby's Cafe$/, '')
                        .trim();
                    const titleLower = title.toLowerCase();
                    if (title === "Coby's Cafe" || title === ''
                        || titleLower.includes('members free rsvp') || titleLower.includes('member free rsvp')) {
                        continue; // Not an event page or intentionally filtered
                    }
                }

                const result = this.parseProductHtml(html, url);
                // Dedup check after parsing (need date for key)
                if ('date' in result) {
                    const dedupKey = `${result.date.year()}-${result.date.monthValue()}-${result.date.dayOfMonth()}-${result.date.hour()}-${result.date.minute()}`;
                    if (seen.has(dedupKey)) continue; // Dedup — not an error
                    seen.add(dedupKey);
                }
                events.push(result);
            } catch (e) {
                events.push({ type: 'ParseError', reason: `Failed to fetch/parse event ${id}: ${e}`, context: id });
            }
        }

        return events;
    }

    // Public for testing — returns RipperCalendarEvent or RipperError, never null
    // Pre-parse filters (dedup, content exclusions) are handled in the caller
    parseProductHtml(html: string, url: string): RipperCalendarEvent | RipperError {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
        if (!titleMatch) return { type: 'ParseError', reason: 'No <title> found in HTML', context: url };

        const title = titleMatch[1]
            .replace(/ \| Coby&#039;s Cafe$/, '')
            .replace(/ \| Coby's Cafe$/, '')
            .trim();

        const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
        const rawDesc = descMatch ? descMatch[1] : '';
        const description = this.decodeHtmlEntities(rawDesc);

        // Per-event image: the product page exposes a specific og:image (the event flyer).
        const imageUrl = this.extractImageUrl(html);

        const parsed = this.parseDateTimeFromText(description);
        if (!parsed) return { type: 'ParseError', reason: 'No parseable date found in description', context: title };

        const { year, month, day, startHour, startMinute, endHour, endMinute } = parsed;

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(year, month, day, startHour, startMinute),
            TIMEZONE
        );
        const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        if (durationMinutes <= 0) return { type: 'ParseError', reason: `Parsed duration <= 0 (${durationMinutes}min)`, context: title };

        return {
            id: url,
            ripped: new Date(),
            date: eventDate,
            duration: Duration.ofMinutes(durationMinutes),
            summary: title,
            description,
            location: LOCATION,
            url,
            imageUrl
        };
    }

    // Public for testing — extracts the per-event flyer image from the product page's
    // og:image meta tag. Returns undefined when none is present (e.g. ticket-only pages).
    extractImageUrl(html: string): string | undefined {
        const og = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
            ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
        const raw = og?.[1]?.trim();
        if (!raw) return undefined;
        // Only accept absolute http(s) URLs; skip data: URIs and empty values.
        if (!/^https?:\/\//i.test(raw)) return undefined;
        return this.decodeHtmlEntities(raw);
    }

    // Public for testing
    parseDateTimeFromText(text: string): {
        year: number; month: number; day: number;
        startHour: number; startMinute: number;
        endHour: number; endMinute: number;
    } | null {
        // Normalize Unicode Mathematical bold/italic chars (e.g. 𝗣𝗠 → PM, 𝗠𝗮𝘆 → May)
        // so the regexes below can match regardless of styling.
        text = text.normalize('NFKC');

        const match = this.findDateTimeMatch(text);
        if (!match) return null;

        const [, monthName, dayStr, startHourStr, startMinStr, startAmPm,
            endHourStr, endMinStr, endAmPm] = match;

        // findDateTimeMatch already verified monthName resolves (that's how
        // it picked this candidate over any earlier non-month word), so this
        // can't be -1 — re-deriving it here just avoids a second lookup
        // table/regex or plumbing the resolved index through the return value.
        const monthIdx = this.resolveMonthIndex(monthName);
        if (monthIdx === -1) return null;

        const month = monthIdx + 1;
        const day = parseInt(dayStr, 10);
        let startHour = parseInt(startHourStr, 10);
        const startMinute = parseInt(startMinStr ?? '0', 10);
        let endHour = parseInt(endHourStr, 10);
        const endMinute = parseInt(endMinStr ?? '0', 10);

        if (endAmPm.toLowerCase() === 'pm' && endHour !== 12) endHour += 12;
        else if (endAmPm.toLowerCase() === 'am' && endHour === 12) endHour = 0;

        if (startAmPm) {
            if (startAmPm.toLowerCase() === 'pm' && startHour !== 12) startHour += 12;
            else if (startAmPm.toLowerCase() === 'am' && startHour === 12) startHour = 0;
        } else if (endAmPm.toLowerCase() === 'pm' && startHour + 12 <= endHour) {
            // Only infer PM for start if adding 12 still keeps it at or before end (e.g. "5-8pm"
            // → 17 ≤ 20 ✓; "11-1pm" → 23 > 13 → keep 11am ✓)
            startHour += 12;
        }

        const today = new Date();
        let year = today.getFullYear();
        const eventDate = new Date(year, month - 1, day);
        if (eventDate < today && today.getTime() - eventDate.getTime() > 24 * 60 * 60 * 1000) {
            year++;
        }

        return { year, month, day, startHour, startMinute, endHour, endMinute };
    }

    /**
     * Tries all three known heading/description shapes against `text`, in
     * priority order, returning the first candidate whose captured month
     * word actually resolves (via resolveMonthIndex), aligned to
     * `[, monthName, dayStr, startHourStr, startMinStr, startAmPm, endHourStr, endMinStr, endAmPm]`,
     * or null if none do.
     *
     * The month position matches any word, not just an enumerated month
     * name — that's what lets a known upstream typo (see
     * MONTH_TYPO_OVERRIDES) still resolve. But naively taking the *first*
     * syntactic match within a shape would let an earlier, unrelated
     * "<word> <day> from <time>-<time>"-shaped phrase (e.g. "Vendor Market
     * 12 from 10am-2pm") steal the match away from a real date later in the
     * same text. So each shape is scanned for *every* candidate occurrence
     * (via matchAll) and the first one whose month actually resolves wins;
     * only once a whole shape produces zero resolving candidates does the
     * next shape get tried. Public for testing.
     */
    findDateTimeMatch(text: string): RegExpMatchArray | string[] | null {
        const monthWord = `[A-Za-z]+`;

        // Primary pattern: "Month Day from StartTime–EndTimePM"
        const re = new RegExp(
            `(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\\s+)?` +
            `(${monthWord})\\s+(\\d{1,2})(?:,?\\s+\\d{4})?` +
            `\\s+from\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?` +
            `\\s*[\\u2013\\-]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)`,
            'gi'
        );
        for (const m of text.matchAll(re)) {
            if (this.resolveMonthIndex(m[1]) !== -1) return m;
        }

        // Alternate pattern: "between StartTime–EndTimePM on [Weekday,] Month Day"
        // Matches e.g. "between 1 PM–3 PM on Saturday, May 30"
        const reAlt = new RegExp(
            `between\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)` +
            `\\s*[\\u2013\\-]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)` +
            `\\s+on\\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\\s+)?` +
            `(${monthWord})\\s+(\\d{1,2})`,
            'gi'
        );
        for (const m of text.matchAll(reAlt)) {
            // Rearrange to align with the primary pattern's named slots:
            // primary: [, monthName, dayStr, startHourStr, startMinStr, startAmPm, endHourStr, endMinStr, endAmPm]
            // alt:     [, startHourStr, startMinStr, startAmPm, endHourStr, endMinStr, endAmPm, monthName, dayStr]
            const [full, sh, sm, sa, eh, em, ea, mon, day] = m;
            if (this.resolveMonthIndex(mon) !== -1) return [full, mon, day, sh, sm, sa, eh, em, ea];
        }

        // Last-resort fallback: "Month Day[, Year] <up to 20 non-digit chars> StartTime - EndTime",
        // with no "from"/"between...on" keyword required, and the start time's
        // am/pm optional (inferred from the end time below, same as the primary
        // pattern) since an emoji-delimited listing may only mark the end time,
        // e.g. "📅 October 3, 2026⏰ 5:30–7:30 PM". Also matches the more
        // classic emoji style some sources use (e.g.
        // "🗓️ Sunday, Sep 6🕒 5:30 pm - 7:00 pm") but doesn't actually require
        // an emoji — only tried after the more specific patterns above fail.
        const reEmoji = new RegExp(
            `(${monthWord})\\s+(\\d{1,2})(?:,?\\s*\\d{4})?` +
            `[^\\d]{0,20}` +
            `(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?` +
            `\\s*[\\u2013\\-]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)`,
            'gi'
        );
        for (const m of text.matchAll(reEmoji)) {
            if (this.resolveMonthIndex(m[1]) !== -1) return m;
        }

        return null;
    }

    /**
     * Resolves a month word captured from free text to a MONTHS index
     * (0-based), or -1 if it doesn't resemble any month:
     *   1. The word is the exact full month name, or the exact standard
     *      3-letter abbreviation ("Sep", not an arbitrary-length prefix like
     *      "Sept" or "Octob"). Since the month regex now captures *any*
     *      alphabetic word (to support MONTH_TYPO_OVERRIDES below, not just
     *      an enumerated month token), accepting any-length prefixes here
     *      would let an unrelated word that happens to fully prefix a month
     *      name (e.g. "Marc" -> "march", "Octob" -> "october") silently
     *      resolve as that month — the exact-length restriction closes that.
     *   2. The word is an exact, explicitly-listed known typo (see
     *      MONTH_TYPO_OVERRIDES) — deliberately not a generic fuzzy/edit-
     *      distance match, which would also cross-match ordinary English
     *      words that happen to sit near a month name (e.g. "Match" or
     *      "Augusta"), silently misdating an unrelated event.
     * Public for testing.
     */
    resolveMonthIndex(word: string): number {
        const w = word.toLowerCase();
        const exactIdx = MONTHS.findIndex(m => m === w || (w.length === 3 && m.startsWith(w)));
        if (exactIdx !== -1) return exactIdx;
        return MONTH_TYPO_OVERRIDES[w] ?? -1;
    }

    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'");
    }
}