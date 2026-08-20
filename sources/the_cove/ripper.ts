import { Ripper, RipperCalendar } from "../../lib/config/schema.js";
import { SquarespaceRipper } from "../../lib/config/squarespace.js";

// The Cove's Squarespace calendar mixes public programming (jazz nights, DJ
// sets) with placeholder "Private Event" bookings that aren't open to the
// public. Drop those so only attendable events reach the calendar.
export function isPrivateBooking(summary: string): boolean {
    return summary.trim().toLowerCase() === "private event";
}

export default class TheCoveRipper extends SquarespaceRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars = await super.rip(ripper);
        for (const cal of calendars) {
            cal.events = cal.events.filter(e => !isPrivateBooking(e.summary));
        }
        return calendars;
    }
}
