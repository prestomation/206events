import { ZoneId } from "@js-joda/core";
import { RipperCalendarEvent } from "../../lib/config/schema.js";
import { SquarespaceRipper, SquarespaceEvent } from "../../lib/config/squarespace.js";

export default class BanditImprovRipper extends SquarespaceRipper {
    protected override mapEvent(sqEvent: SquarespaceEvent, timezone: ZoneId, baseUrl: URL): RipperCalendarEvent | null {
        const event = super.mapEvent(sqEvent, timezone, baseUrl);
        if (!event) return null;

        const isFree = /\bfree\b/i.test(sqEvent.title);
        event.cost = isFree ? { min: 0 } : { paid: true };
        return event;
    }
}
