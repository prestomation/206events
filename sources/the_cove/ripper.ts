import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

// The Cove's Squarespace calendar mixes public programming (jazz nights, DJ
// sets) with placeholder "Private Event" bookings that aren't open to the
// public. Drop those so only attendable events reach the calendar.
export function isPrivateBooking(title: string): boolean {
    return title.trim().toLowerCase() === "private event";
}

export default class TheCoveRipper extends SquarespaceRipper {
    // Filtered here rather than after rip() so private bookings never reach
    // mapEvent — an endDate-less one would otherwise leave an orphaned
    // UncertaintyError in cal.errors for an event nobody can attend.
    protected override async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        const events = await super.fetchUpcomingEvents(baseUrl);
        return events.filter(e => !isPrivateBooking(e.title ?? ''));
    }
}
