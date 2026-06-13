import { EventCost, Ripper, RipperCalendar } from "../../lib/config/schema.js";
import { SquarespaceRipper } from "../../lib/config/squarespace.js";

/**
 * SUMM events embed admission type in the Squarespace excerpt, e.g.:
 *   "FREE ADMISSION — DROP-IN"
 *   "FREE EVENT — Registration Required"
 *   "REGISTRATION REQUIRED — PAID CLASS"
 */
export function extractSUMMCost(text: string): EventCost | undefined {
    if (/paid class|paid event|summer camp/i.test(text)) return { paid: true };
    if (/free admission|free event|\bfree\b/i.test(text)) return { min: 0 };
    return undefined;
}

export default class SUMMRipper extends SquarespaceRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars = await super.rip(ripper);
        for (const cal of calendars) {
            for (const event of cal.events) {
                const text = [event.summary, event.description].filter(Boolean).join(' ');
                const cost = extractSUMMCost(text);
                if (cost !== undefined) {
                    event.cost = cost;
                }
            }
        }
        return calendars;
    }
}
