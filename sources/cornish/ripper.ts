import { Duration, ZonedDateTime } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig } from "../../lib/config/proxy-fetch.js";
import '@js-joda/timezone';

const GROUP_ID = '50276813607690';
const DEFAULT_DURATION_HOURS = 2;

interface LocalistEventInstance {
    event_instance: {
        id: number;
        event_id: number;
        start: string;
        end: string | null;
        all_day: boolean;
    };
}

interface LocalistEvent {
    event: {
        id: number;
        title: string;
        url: string | null;
        description_text: string;
        address: string;
        location_name: string;
        free: boolean;
        ticket_url: string | null;
        ticket_cost: string;
        event_instances: LocalistEventInstance[];
        photo_url: string | null;
        localist_url: string;
    };
}

interface LocalistResponse {
    events: LocalistEvent[];
    page: {
        current: number;
        size: number;
        total: number;
    };
}

export default class CornishRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const fetchFn = getFetchForConfig(ripper.config);
        const calConfig = ripper.config.calendars[0];
        const baseUrl = ripper.config.url.toString();

        const events: RipperCalendarEvent[] = [];
        const errors: RipperError[] = [];

        let page = 1;
        while (true) {
            const url = `${baseUrl}?group_id=${GROUP_ID}&pp=50&days=365&page=${page}`;
            const res = await fetchFn(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 206events/1.0)' },
            });
            if (!res.ok) {
                throw new Error(`Localist API returned ${res.status} ${res.statusText}`);
            }

            const data: LocalistResponse = await res.json();

            for (const item of data.events) {
                const parsed = this.parseEvent(item);
                for (const result of parsed) {
                    if ('date' in result) {
                        events.push(result);
                    } else {
                        errors.push(result);
                    }
                }
            }

            if (data.events.length < 50 || page * 50 >= data.page.total) break;
            page++;
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

    parseEvent(item: LocalistEvent): (RipperCalendarEvent | RipperError)[] {
        const evt = item.event;

        if (!evt.event_instances || evt.event_instances.length === 0) {
            return [{
                type: 'ParseError',
                reason: 'No event instances found',
                context: evt.title,
            }];
        }

        const parts = [evt.location_name, evt.address].filter(Boolean);
        const location = parts.length > 0
            ? parts.join(', ')
            : 'Cornish College of the Arts, Seattle, WA';

        const url = evt.localist_url || evt.ticket_url || undefined;
        const imageUrl = evt.photo_url || undefined;
        const description = evt.description_text || undefined;
        const cost = evt.free ? ({ min: 0 } as const) : undefined;

        const results: (RipperCalendarEvent | RipperError)[] = [];

        for (const instance of evt.event_instances) {
            const inst = instance.event_instance;

            if (!inst.start) {
                results.push({
                    type: 'ParseError',
                    reason: 'Event instance has no start time',
                    context: evt.title,
                });
                continue;
            }

            let start: ZonedDateTime;
            try {
                start = ZonedDateTime.parse(inst.start);
            } catch {
                results.push({
                    type: 'ParseError',
                    reason: `Could not parse start time: ${inst.start}`,
                    context: evt.title,
                });
                continue;
            }

            let duration = Duration.ofHours(DEFAULT_DURATION_HOURS);
            if (inst.end) {
                try {
                    const end = ZonedDateTime.parse(inst.end);
                    const diffMillis = end.toInstant().toEpochMilli() - start.toInstant().toEpochMilli();
                    if (diffMillis > 0) duration = Duration.ofMillis(diffMillis);
                } catch {
                    // use default duration
                }
            }

            const id = `cornish-${inst.id}`;

            results.push({
                id,
                ripped: new Date(),
                date: start,
                duration,
                summary: evt.title,
                location,
                url: url ?? '',
                description,
                imageUrl,
                cost,
            });
        }

        return results;
    }
}
