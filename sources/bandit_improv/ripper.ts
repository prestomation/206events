import { Ripper, RipperCalendar } from "../../lib/config/schema.js";
import { SquarespaceRipper } from "../../lib/config/squarespace.js";

export default class BanditImprovRipper extends SquarespaceRipper {
    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars = await super.rip(ripper);
        for (const cal of calendars) {
            for (const event of cal.events) {
                event.cost = /\bfree\b/i.test(event.summary) ? { min: 0 } : { paid: true };
            }
        }
        return calendars;
    }
}
