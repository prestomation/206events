import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import { Duration, LocalDate, ZonedDateTime, ZoneId } from "@js-joda/core";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parse } from "node-html-parser";
import { decode } from "html-entities";
import '@js-joda/timezone';

const LOCATION = "U Wine Bar, 4455 Stone Way N, Seattle, WA 98103";
const SITE_ORIGIN = "https://www.uwinebar.com";
// Fallback only — rip() passes the real zone from ripper.yaml's calendar config.
const DEFAULT_TIMEZONE = ZoneId.of("America/Los_Angeles");

// Crystal Commerce lists each event as a product but never states an end
// time. These are game-store draft/prerelease/tournament events, which
// typically run 3+ hours (prereleases and drafts especially), so 3 hours is
// a more realistic default than a typical bar event.
const DEFAULT_DURATION = Duration.ofHours(3);

// Used only when a listing's title has a date but no time (e.g. "09/14/26
// Sip & Sculpt Bag Charms & Key Chains" — see sample-data.html). Most of the
// site's timed events cluster around 6pm, so that's a reasonable placeholder
// while the event-uncertainty-resolver skill fills in the real value.
const DEFAULT_UNKNOWN_HOUR = 18;
const DEFAULT_UNKNOWN_MINUTE = 0;

// Matches the leading "MM/DD/YY" or "M/D/YY" date at the start of a product
// title, e.g. "09/09/26 6:30pm ..." or "10/3/26 1pm ...". A title with no
// leading date at all (e.g. "Friday Night Magic 6:30pm Weekly") is a
// recurring product template, not a dated event instance, and simply won't
// match this — the caller treats that as "not a dated event, skip it".
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2})\s*/;

// Matches an optional time immediately following the date, e.g. "6:30pm",
// "6pm", "9am". Anchored to the start of the remaining text (after the date
// prefix is stripped) so it only matches a time that directly follows the
// date, not a stray number later in the event name.
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?\s*/i;

export default class UWineBarRipper implements IRipper {
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

    // Public for testing. Events are sold as Crystal Commerce products on a
    // single catalog page — each is an `<li class="product" itemscope
    // itemtype="http://schema.org/Product">`. The product's `title` attribute
    // (on the `h4[itemprop="name"]`) carries the full "MM/DD/YY[ time]
    // <name>" text; the first `a[itemprop="url"]` carries the relative event
    // URL, and `img[itemprop="image"]` the per-event photo.
    //
    // `timezone` defaults to America/Los_Angeles so existing call sites/tests
    // that don't care about DST edge cases keep working; rip() always passes
    // the calendar's configured zone explicitly.
    public parseEventsFromHtml(html: string, sourceUrl: string, timezone: ZoneId = DEFAULT_TIMEZONE): RipperEvent[] {
        const root = parse(html);
        const products = root.querySelectorAll('li.product');

        const events: RipperEvent[] = [];
        const seen = new Set<string>();

        for (const product of products) {
            const nameEl = product.querySelector('h4[itemprop="name"]');
            const rawTitle = nameEl?.getAttribute('title');
            if (!rawTitle) continue; // not a product with a name — shouldn't happen

            const title = decode(rawTitle).replace(/\s+/g, ' ').trim();
            const parsed = this.parseTitle(title);
            if (!parsed) continue; // no leading date — a recurring "Weekly" template product, not a dated instance

            const linkEl = product.querySelector('a[itemprop="url"]');
            const href = linkEl?.getAttribute('href');
            const eventUrl = href ? new URL(href, SITE_ORIGIN).href : sourceUrl;

            const imgEl = product.querySelector('img[itemprop="image"]');
            const imageUrl = imgEl?.getAttribute('src') || undefined;

            const hour = parsed.hour ?? DEFAULT_UNKNOWN_HOUR;
            const minute = parsed.minute ?? DEFAULT_UNKNOWN_MINUTE;
            const date = ZonedDateTime.of(
                parsed.date.year(), parsed.date.monthValue(), parsed.date.dayOfMonth(),
                hour, minute, 0, 0, timezone,
            );

            const id = this.generateEventId(parsed.name, parsed.date);
            if (seen.has(id)) continue;
            seen.add(id);

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                date,
                duration: DEFAULT_DURATION,
                summary: parsed.name,
                description: '',
                location: LOCATION,
                url: eventUrl,
                imageUrl,
            };
            events.push(event);

            if (parsed.hour === null) {
                events.push({
                    type: 'Uncertainty',
                    reason: `No start time found in title "${title}"`,
                    source: 'u-wine-bar',
                    unknownFields: ['startTime'],
                    event,
                    partialFingerprint: title,
                });
            }
        }

        return events;
    }

    // Public for testing. Parses a product title into its leading date, an
    // optional time, and the remaining event name. Returns null when the
    // title has no leading "M/D/YY" date at all (the two "... Weekly"
    // recurring product templates) — the caller treats that as "not a dated
    // event instance", not an error.
    public parseTitle(title: string): { date: LocalDate; hour: number | null; minute: number | null; name: string } | null {
        const dateMatch = title.match(DATE_RE);
        if (!dateMatch) return null;

        const month = parseInt(dateMatch[1], 10);
        const day = parseInt(dateMatch[2], 10);
        const year = 2000 + parseInt(dateMatch[3], 10);
        let date: LocalDate;
        try {
            date = LocalDate.of(year, month, day);
        } catch {
            return null;
        }

        const rest = title.slice(dateMatch[0].length);

        const timeMatch = rest.match(TIME_RE);
        let hour: number | null = null;
        let minute: number | null = null;
        let name = rest;
        if (timeMatch) {
            hour = parseInt(timeMatch[1], 10);
            minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
            const isPm = timeMatch[3].toLowerCase() === 'p';
            if (hour >= 1 && hour <= 12 && minute <= 59) {
                if (isPm && hour !== 12) hour += 12;
                else if (!isPm && hour === 12) hour = 0;
                name = rest.slice(timeMatch[0].length);
            } else {
                // Out-of-range hour/minute — not actually a time marker, leave
                // it as part of the name and report no time found.
                hour = null;
                minute = null;
            }
        }

        return { date, hour, minute, name: name.trim() };
    }

    // Stable id derived purely from source content (event name + date) — no
    // timestamps, no array indices. See AGENTS.md "Ripper Design: Stable
    // Event IDs". Same-day showings on this site (e.g. the "Reality Fracture
    // Prerelease N" series) already carry distinct numbered names, so
    // name+date alone is sufficient without an extra time-slot suffix.
    private generateEventId(name: string, date: LocalDate): string {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `${slug}-${date.toString()}`;
    }
}
