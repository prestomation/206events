import { ZoneId, Period } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError } from "../../lib/config/schema.js";
import { getFetchForConfig, FetchFn } from "../../lib/config/proxy-fetch.js";
import { parseTrumbaEvent } from "../spl/ripper.js";
import '@js-joda/timezone';

export default class SPLAuthorsRipper implements IRipper {
    private fetchFn: FetchFn = (url, init) => fetch(url, init);

    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        this.fetchFn = getFetchForConfig(ripper.config);

        const weeks = this.getWeeksFromLookahead(ripper.config.lookahead);
        const url = new URL(ripper.config.url.toString());
        url.searchParams.set("weeks", String(weeks));

        const events = await this.fetchEvents(url.toString());
        const timezone = ZoneId.of("America/Los_Angeles");
        const calConfig = ripper.config.calendars[0];

        const parsed = events
            .filter((e: any) => !e.canceled)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((e: any) => {
                try {
                    return parseTrumbaEvent(e, timezone);
                } catch (err) {
                    return {
                        type: "ParseError",
                        reason: `Failed to parse SPL Authors & Books event ${e.eventID}: ${err}`,
                        context: String(e.title ?? "").substring(0, 200),
                    } as RipperError;
                }
            });

        return [{
            name: calConfig.name,
            friendlyname: calConfig.friendlyname,
            events: parsed.filter((e: any) => 'date' in e) as RipperCalendarEvent[],
            errors: parsed.filter((e: any) => 'type' in e) as RipperError[],
            parent: ripper.config,
            tags: calConfig.tags ?? [],
        }];
    }

    private async fetchEvents(url: string): Promise<any[]> {
        const res = await this.fetchFn(url);
        if (!res.ok) {
            throw new Error(`SPL Trumba Authors & Books API error: HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            throw new Error("SPL Trumba Authors & Books API returned non-array response");
        }
        return data;
    }

    private getWeeksFromLookahead(lookahead?: Period): number {
        if (!lookahead) return 6;
        const days = lookahead.days() + lookahead.months() * 30 + lookahead.years() * 365;
        return Math.max(1, Math.ceil(days / 7));
    }
}
