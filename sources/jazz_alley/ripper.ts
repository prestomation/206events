import { Duration, LocalDate, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { parse as parseHtml, HTMLElement } from "node-html-parser";
import { decode } from "html-entities";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

// Dimitriou's Jazz Alley (Belltown) runs a custom JSP site with no ICS/API.
// The calendar page (`calendar.jsp`) lists every booked "show" (an artist's
// multi-night run) as a `.news-box` card linking to `artist.jsp?shownum=N`,
// but only carries a *date range* for the run (e.g. "Thu, Sep 3 - Sun, Sep
// 6, 2026") — never individual showtimes. Each artist detail page carries
// the real per-night, sometimes per-set (early/late), performance list in a
// `<select name="perfnum">` (e.g. "Fri, Sep 4, 2026 9:30 PM"), plus the
// ticket price. So this is a two-level scrape: list shows, then fetch each
// show's detail page for its real performances. The site itself only lists
// performances that haven't happened yet, so no extra date filtering is
// needed here.
const BASE_URL = "https://www.jazzalley.com";
const CALENDAR_URL = `${BASE_URL}/www-home/calendar.jsp`;
const VENUE_ADDRESS = "Dimitriou's Jazz Alley, 2033 6th Ave, Seattle, WA 98121";
const TIMEZONE = ZoneId.of("America/Los_Angeles");
const USER_AGENT = "Mozilla/5.0 (compatible; 206events/1.0)";
// The site never publishes an end time or set length; Jazz Alley sets
// typically run 75-90 minutes, so default to 90.
const DEFAULT_DURATION = Duration.ofMinutes(90);

const MONTHS: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export interface ParsedShowCard {
    shownum: string;
    title: string;
    description?: string;
    imageUrl?: string;
}

export interface ParsedPerformance {
    perfnum: string;
    date: LocalDate;
    hour: number;
    minute: number;
    soldOut: boolean;
}

export default class JazzAlleyRipper implements IRipper {
    private fetchFn: FetchFn = fetch;

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);
        const cal = ripper.config.calendars[0];

        const res = await this.fetchFn(CALENDAR_URL, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) {
            throw new Error(`Jazz Alley calendar returned HTTP ${res.status}`);
        }
        const html = await res.text();
        const cards = this.parseCalendarCards(html);

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const card of cards) {
            const results = await this.fetchAndParseShow(card);
            for (const result of results) {
                if ("date" in result) events.push(result);
                else errors.push(result);
            }
        }

        return [{
            name: cal.name,
            friendlyname: cal.friendlyname,
            events,
            errors,
            tags: cal.tags ?? ripper.config.tags ?? [],
            parent: ripper.config,
        }];
    }

    /**
     * Parses the `.news-box` show cards on `calendar.jsp` into
     * {shownum, title, description, imageUrl}. Each card's image and h2 both
     * link to the same `artist.jsp?shownum=N` detail page — dedup by
     * shownum so a card isn't fetched twice. Public for testing.
     */
    public parseCalendarCards(html: string): ParsedShowCard[] {
        const doc = parseHtml(html);
        const cards: ParsedShowCard[] = [];
        const seen = new Set<string>();

        for (const box of doc.querySelectorAll(".news-box")) {
            const link = box.querySelector("a[href*='shownum=']");
            const shownum = link?.getAttribute("href")?.match(/shownum=(\d+)/)?.[1];
            if (!shownum || seen.has(shownum)) continue;

            const titleEl = box.querySelector(".text-box h2");
            const title = titleEl ? decode(titleEl.text.replace(/\s+/g, " ").trim()) : undefined;
            if (!title) continue;
            seen.add(shownum);

            const descEl = box.querySelector(".text-box p");
            const description = descEl ? decode(descEl.text.replace(/\s+/g, " ").trim()) : undefined;

            const imgEl = box.querySelector(".img-box img");
            const rawSrc = imgEl?.getAttribute("src")?.trim();
            const imageUrl = rawSrc ? this.resolveUrl(rawSrc) : undefined;

            cards.push({ shownum, title, description: description || undefined, imageUrl });
        }

        return cards;
    }

    private resolveUrl(raw: string): string {
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith("//")) return `https:${raw}`;
        return `${BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
    }

    private async fetchAndParseShow(card: ParsedShowCard): Promise<RipperEvent[]> {
        const url = `${BASE_URL}/www-home/artist.jsp?shownum=${card.shownum}`;
        let html: string;
        try {
            const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
            if (!res.ok) {
                return [{ type: "ParseError", reason: `HTTP ${res.status} fetching show detail page`, context: url }];
            }
            html = await res.text();
        } catch (error) {
            return [{ type: "ParseError", reason: `Failed to fetch show detail page: ${error}`, context: url }];
        }
        return this.parseShowDetail(card, html, url);
    }

    /**
     * Parses one `artist.jsp?shownum=N` detail page into one event per
     * remaining performance. Public for testing.
     */
    public parseShowDetail(card: ParsedShowCard, html: string, url: string): RipperEvent[] {
        const doc = parseHtml(html);
        const performances = this.parsePerformances(doc);

        if (performances.length === 0) {
            return [{
                type: "ParseError",
                reason: `No parseable performance times found for "${card.title}" (run may be sold out / past)`,
                context: url,
            }];
        }

        const priceText = doc.querySelector(".price-box .price")?.text?.trim();
        const priceMatch = priceText?.match(/\$([\d,]+(?:\.\d+)?)/);
        const cost = priceMatch ? { min: parseFloat(priceMatch[1].replace(/,/g, "")) } : undefined;

        return performances.map((p): RipperCalendarEvent => {
            const date = ZonedDateTime.of(
                LocalDateTime.of(p.date.year(), p.date.monthValue(), p.date.dayOfMonth(), p.hour, p.minute),
                TIMEZONE,
            );
            // Multiple sets on the same night (e.g. 7:30pm early / 9:30pm
            // late) need a distinct id per AGENTS.md's "Stable Event IDs" —
            // Jazz Alley's own perfnum already uniquely identifies each
            // performance, so use it directly rather than a derived slot suffix.
            const id = `jazz-alley-${card.shownum}-${p.perfnum}`;

            return {
                id,
                ripped: new Date(),
                date,
                duration: DEFAULT_DURATION,
                summary: card.title,
                description: card.description,
                location: VENUE_ADDRESS,
                url,
                imageUrl: card.imageUrl,
                ...(p.soldOut ? { cost: { soldOut: true } } : cost ? { cost } : {}),
            };
        });
    }

    /**
     * Extracts every real performance option from the `<select
     * name="perfnum">` (skipping the `value="0"` placeholder option whose
     * *text* is literally "Choose a Performance"). A sold-out performance
     * keeps its real date/time text but reuses `value="0"` with a
     * " - FULL" suffix (e.g. "Mon, Sep 28, 2026 7:30 PM - FULL") rather than
     * a real perfnum — detected here and given a synthesized, still-unique
     * perfnum (`full-<date>-<time>`) so it isn't mistaken for the
     * placeholder and dropped. Public for testing.
     */
    public parsePerformances(doc: HTMLElement): ParsedPerformance[] {
        const performances: ParsedPerformance[] = [];
        for (const opt of doc.querySelectorAll("select[name='perfnum'] option")) {
            const value = opt.getAttribute("value");
            const rawText = decode(opt.text.trim());
            if (!value || rawText === "Choose a Performance") continue;

            const soldOut = /-\s*(FULL|SOLD\s*OUT)\s*$/i.test(rawText);
            const cleanText = soldOut ? rawText.replace(/-\s*(FULL|SOLD\s*OUT)\s*$/i, "").trim() : rawText;
            const parsed = this.parsePerformanceText(cleanText);
            if (!parsed) continue;

            const perfnum = value !== "0" ? value : `full-${parsed.date.toString()}-${parsed.hour}${parsed.minute}`;
            performances.push({ perfnum, soldOut, ...parsed });
        }
        return performances;
    }

    /** Parses "Wed, Sep 2, 2026 7:30 PM" into a date + 24h hour/minute. Public for testing. */
    public parsePerformanceText(text: string): { date: LocalDate; hour: number; minute: number } | null {
        const m = text.match(/^\w+,\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!m) return null;
        const monthKey = m[1].slice(0, 3);
        const month = MONTHS[monthKey[0].toUpperCase() + monthKey.slice(1).toLowerCase()];
        if (!month) return null;
        const day = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        let hour = parseInt(m[4], 10) % 12;
        if (m[6].toUpperCase() === "PM") hour += 12;
        const minute = parseInt(m[5], 10);
        try {
            return { date: LocalDate.of(year, month, day), hour, minute };
        } catch {
            return null;
        }
    }
}
