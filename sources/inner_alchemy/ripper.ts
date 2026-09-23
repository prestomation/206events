import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

// The calendar also carries daily retail "Shop is OPEN" entries for the
// sister shop — store hours, not events.
const STORE_HOURS_RE = /^\s*shop\s+is\s+open\b/i;

export function isStoreHoursEntry(title: string | undefined): boolean {
    return STORE_HOURS_RE.test(title ?? "");
}

export default class InnerAlchemyRipper extends SquarespaceRipper {
    protected override async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        const events = await super.fetchUpcomingEvents(baseUrl);
        return events.filter(e => !isStoreHoursEntry(e.title));
    }
}
