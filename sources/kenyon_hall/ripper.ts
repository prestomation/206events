import { parse } from 'node-html-parser';
import { EventCost, Ripper, RipperCalendar, UncertaintyError } from "../../lib/config/schema.js";
import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

/**
 * Extracts cost from Kenyon Hall event text.
 * Kenyon Hall buries pricing in the Squarespace body (not just the excerpt), e.g.:
 *   "$20 General / Half-priced Senior/Students"
 *   "ALL ENTRY - FREE"
 *   "Suggested Donation - $20"
 */
export function extractKenyonHallCost(text: string): EventCost | undefined {
    // "Suggested Donation", PWYW, and NOTAFLOF are free per pricing rubric.
    // Check before dollar-amount regex so "Suggested Donation - $20" → free.
    if (/suggested donation|pay what you can|pwyw|notaflof/i.test(text)) return { min: 0 };

    if (/\bfree\b/i.test(text)) return { min: 0 };

    // First dollar amount is the general-admission floor price.
    const m = text.match(/\$(\d+(?:\.\d{2})?)/);
    if (m) return { min: parseFloat(m[1]) };

    return undefined;
}

export default class KenyonHallRipper extends SquarespaceRipper {
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
                const bodyText = rawBody ? parse(rawBody).textContent : '';
                const text = [event.summary, event.description, bodyText].filter(Boolean).join(' ');
                const cost = extractKenyonHallCost(text);
                if (cost !== undefined) {
                    event.cost = cost;
                } else {
                    const uncertainty: UncertaintyError = {
                        type: "Uncertainty",
                        reason: "No price found in Kenyon Hall event text",
                        source: ripper.config.name,
                        unknownFields: ["cost"],
                        event,
                        partialFingerprint: simpleHash(text.substring(0, 200)),
                    };
                    cal.errors.push(uncertainty);
                }
            }
        }
        return calendars;
    }
}
