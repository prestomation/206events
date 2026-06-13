import { parse } from 'node-html-parser';
import { EventCost, Ripper, RipperCalendar } from "../../lib/config/schema.js";
import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

/**
 * Extracts cost from Rendezvous event body text.
 * Pricing lives in the Squarespace body (not the excerpt), e.g.:
 *   "Doors at 7pm. Show at 8pm. 21+ $10 Cover"
 *   "Tickets are $10!"
 *   "five bux $5 (or free with industry stub, iykyk)"
 * Dollar amount is checked before \bfree\b so "$5 (or free ...)" resolves to {min:5}.
 * Style/script blocks are stripped first to avoid CSS class names ("Tickets", "$N") triggering false positives.
 */
export function extractRendezvousCost(rawBody: string, summary: string): EventCost | undefined {
    const root = parse(rawBody);
    root.querySelectorAll('style, script').forEach(el => el.remove());
    const bodyText = root.textContent;
    const text = [summary, bodyText].filter(Boolean).join(' ');

    if (/suggested donation|pay what you can|pwyw|notaflof/i.test(text)) return { min: 0 };
    const m = text.match(/\$(\d+(?:\.\d{2})?)/);
    if (m) return { min: parseFloat(m[1]) };
    if (/\bfree\b/i.test(text)) return { min: 0 };
    if (/\btickets?\b/i.test(text)) return { paid: true };
    return undefined;
}

export default class RendezvousRipper extends SquarespaceRipper {
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
                const cost = extractRendezvousCost(rawBody, event.summary);
                if (cost !== undefined) event.cost = cost;
            }
        }
        return calendars;
    }
}
