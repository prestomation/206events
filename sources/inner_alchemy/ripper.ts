import { ZoneId } from "@js-joda/core";
import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";
import { RipperCalendarEvent } from "../../lib/config/schema.js";

// The calendar also carries daily retail "Shop is OPEN" entries for the
// sister shop — store hours, not events.
const STORE_HOURS_RE = /^\s*shop\s+is\s+open\b/i;

export function isStoreHoursEntry(title: string | undefined): boolean {
    return STORE_HOURS_RE.test(title ?? "");
}

// Most Inner Alchemy classes are paid (yoga, breathwork, workshops). A small
// number explicitly offer free or donation-based admission — "Recovery in
// Motion", "Heavily Meditated" community meditations, "Death Cafe". These
// signal themselves in the description with the word "free" or donation language.
const FREE_TEXT_RE = /\bfree\b|\bby donation\b|\bdonation[- ]based\b|\bsuggested donation\b|\bpay what you (?:can|will)\b/i;

function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, ' ');
}

export default class InnerAlchemyRipper extends SquarespaceRipper {
    protected override async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        const events = await super.fetchUpcomingEvents(baseUrl);
        return events.filter(e => !isStoreHoursEntry(e.title));
    }

    protected override mapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL): RipperCalendarEvent | null {
        const event = super.mapEvent(sqEvent, timezone, baseUrl);
        if (event === null) return null;
        if (event.cost !== undefined) return event; // tags already resolved it

        const bodyText = sqEvent.body ? stripHtmlTags(sqEvent.body) : '';
        const combined = [sqEvent.title, sqEvent.excerpt, bodyText]
            .filter(Boolean)
            .join(' ');

        event.cost = FREE_TEXT_RE.test(combined) ? { min: 0 } : { paid: true };
        return event;
    }
}
