import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

/**
 * Browne Family Vineyards' Squarespace events collection is shared across
 * all of their tasting rooms (Seattle, Bellevue, Tacoma, Walla Walla,
 * Spokane) plus off-site partner venues. Keep only events physically
 * located in Seattle, identified by the geocoded address' city/state/zip
 * line rather than the venue title (which doesn't follow a single naming
 * pattern for off-site partner venues like Tulio Ristorante).
 */
export function filterSeattleEvents(events: SquarespaceEvent[]): SquarespaceEvent[] {
    return events.filter(e => e.location?.addressLine2?.trim().toLowerCase().startsWith("seattle"));
}

export default class BrowneFamilyVineyardsSeattleRipper extends SquarespaceRipper {
    protected override async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        const allEvents = await super.fetchUpcomingEvents(baseUrl);
        return filterSeattleEvents(allEvents);
    }
}
