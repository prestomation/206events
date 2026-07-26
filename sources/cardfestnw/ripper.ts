import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent, UncertaintyError } from "../../lib/config/schema.js";
import { Duration, LocalDateTime, ZonedDateTime, ZoneId } from "@js-joda/core";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const TIMEZONE = ZoneId.of('America/Los_Angeles');

// cardfestnw.com (rebuilt on Framer) publishes its schedule as schema.org
// JSON-LD embedded in the homepage — but the JSON-LD `startDate` is
// date-only (e.g. "2026-07-18") and the linked ticket pages don't carry a
// time either, so every event here gets a placeholder time paired with an
// UncertaintyError for the event-uncertainty-resolver skill to fill in.
// See docs/event-uncertainty.md.
const DEFAULT_UNKNOWN_TIME_HOUR = 10;
const DEFAULT_UNKNOWN_TIME_MINUTE = 0;
const DEFAULT_UNKNOWN_DURATION = Duration.ofHours(4);

interface JsonLdEvent {
    "@type": string;
    name?: string;
    startDate?: string;
    url?: string;
    image?: string;
    location?: {
        name?: string;
        address?: {
            streetAddress?: string;
            addressLocality?: string;
            addressRegion?: string;
        };
    };
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Cheap deterministic hash; we only need stability, not crypto strength.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
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
        const jsonLdEvents = this.extractJsonLdEvents(html);

        const now = ZonedDateTime.now(TIMEZONE);
        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        for (const jle of jsonLdEvents) {
            const result = this.parseEvent(jle);
            if ('type' in result) {
                errors.push(result);
                continue;
            }
            if (result.date.isBefore(now)) continue;

            events.push(result);
            errors.push({
                type: "Uncertainty",
                reason: `cardfestnw does not publish a start time (raw startDate: "${jle.startDate}")`,
                source: "cardfestnw",
                calendar: calConfig.name,
                unknownFields: ["startTime", "duration"],
                event: result,
                partialFingerprint: simpleHash(`${jle.startDate}|${jle.url ?? ''}`),
            } satisfies UncertaintyError);
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
    extractJsonLdEvents(html: string): JsonLdEvent[] {
        const scriptRegex = /<script type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        const events: JsonLdEvent[] = [];
        let match: RegExpExecArray | null;
        while ((match = scriptRegex.exec(html)) !== null) {
            try {
                const data = JSON.parse(match[1]);
                const graph = Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];
                for (const node of graph) {
                    if (node && typeof node === "object" && node["@type"] === "Event") {
                        events.push(node as JsonLdEvent);
                    }
                }
            } catch { /* skip malformed JSON-LD blocks */ }
        }
        return events;
    }

    // Public for testing
    parseEvent(jle: JsonLdEvent): RipperEvent {
        if (!jle.name || !jle.startDate) {
            return {
                type: 'ParseError',
                reason: 'Event JSON-LD missing name or startDate',
                context: JSON.stringify(jle).slice(0, 200),
            };
        }

        const dateMatch = jle.startDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!dateMatch) {
            return {
                type: 'ParseError',
                reason: `Could not parse startDate: ${jle.startDate}`,
                context: jle.name,
            };
        }
        const [, yearStr, monthStr, dayStr] = dateMatch;

        const eventDate = ZonedDateTime.of(
            LocalDateTime.of(
                parseInt(yearStr, 10),
                parseInt(monthStr, 10),
                parseInt(dayStr, 10),
                DEFAULT_UNKNOWN_TIME_HOUR,
                DEFAULT_UNKNOWN_TIME_MINUTE,
            ),
            TIMEZONE
        );

        const addr = jle.location?.address;
        const cityState = [addr?.addressLocality, addr?.addressRegion].filter(Boolean).join(', ');
        const location = [jle.location?.name, addr?.streetAddress, cityState].filter(Boolean).join(', ') || undefined;

        return {
            id: `cardfestnw-${slugify(jle.name)}-${jle.startDate}`,
            ripped: new Date(),
            date: eventDate,
            duration: DEFAULT_UNKNOWN_DURATION,
            summary: jle.name,
            location,
            url: jle.url,
            imageUrl: jle.image,
            cost: { paid: true },
        };
    }
}
