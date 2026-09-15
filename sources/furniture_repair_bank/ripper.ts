import { parse } from 'node-html-parser';
import { decode } from 'html-entities';
import { Ripper, RipperCalendar, UncertaintyError } from "../../lib/config/schema.js";
import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

const ADDRESS_RE = /address:\s*(.+?,\s*WA\s*\d{5})/i;

/**
 * Furniture Repair Bank never populates Squarespace's structured `location`
 * field — every event's address is buried as prose in the body ("Address:
 * <street>, Seattle, WA <zip>"). Extract it; returns undefined when no such
 * line is found rather than guessing, so the caller can raise an
 * UncertaintyError instead of asserting an unverified address as fact.
 */
export function extractRepairBankLocation(rawBody: string): string | undefined {
    const root = parse(rawBody);
    root.querySelectorAll('style, script').forEach(el => el.remove());
    const text = decode(root.textContent).replace(/\s+/g, ' ').trim();
    const match = text.match(ADDRESS_RE);
    return match ? match[1].trim() : undefined;
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
                // Squarespace's structured location field is always empty for this
                // source, but never clobber it if that ever changes.
                if (event.location) continue;

                const rawBody = event.id ? (bodyMap.get(event.id) ?? '') : '';
                const location = extractRepairBankLocation(rawBody);
                if (location) {
                    event.location = location;
                } else {
                    const uncertainty: UncertaintyError = {
                        type: "Uncertainty",
                        reason: "No 'Address:' line found in Furniture Repair Bank event body",
                        source: ripper.config.name,
                        unknownFields: ["location"],
                        event,
                        partialFingerprint: simpleHash(rawBody.substring(0, 200)),
                    };
                    cal.errors.push(uncertainty);
                }
            }
        }
        return calendars;
    }
}
