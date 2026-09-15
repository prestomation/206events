import { parse } from 'node-html-parser';
import { decode } from 'html-entities';
import { Ripper, RipperCalendar } from "../../lib/config/schema.js";
import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

// Furniture Repair Bank's main volunteer shop. Nearly every event happens
// here; a minority ("Collection Event: ...") happen at a Seattle transfer
// station and carry their own "Address:" line in the body that overrides
// this fallback.
const FALLBACK_ADDRESS = "1938B Occidental Ave S, Seattle, WA 98134";

const ADDRESS_RE = /address:\s*(.+?,\s*WA\s*\d{5})/i;

/**
 * Furniture Repair Bank never populates Squarespace's structured `location`
 * field — every event's address is buried as prose in the body ("Address:
 * <street>, Seattle, WA <zip>"). Extract it, falling back to the shop's own
 * address when a body has no such line.
 */
export function extractRepairBankLocation(rawBody: string): string {
    const root = parse(rawBody);
    root.querySelectorAll('style, script').forEach(el => el.remove());
    const text = decode(root.textContent).replace(/\s+/g, ' ').trim();
    const match = text.match(ADDRESS_RE);
    return match ? match[1].trim() : FALLBACK_ADDRESS;
}

export default class FurnitureRepairBankRipper extends SquarespaceRipper {
    private sqEvents: SquarespaceEvent[] = [];

    protected override async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        this.sqEvents = await super.fetchUpcomingEvents(baseUrl);
        return this.sqEvents;
    }

    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars = await super.rip(ripper);
        const bodyMap = new Map(this.sqEvents.map(e => [e.id, e.body || '']));
        for (const cal of calendars) {
            for (const event of cal.events) {
                const rawBody = event.id ? (bodyMap.get(event.id) ?? '') : '';
                event.location = extractRepairBankLocation(rawBody);
            }
        }
        return calendars;
    }
}
