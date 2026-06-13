import { parse } from 'node-html-parser';
import { EventCost, Ripper, RipperCalendar } from "../../lib/config/schema.js";
import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

/**
 * Extracts cost from Seattle Japanese Garden event body text.
 * Pricing is in the Squarespace body (not the excerpt), e.g.:
 *   "Tickets available at seattlejapanesegarden.org"
 *   "Free First Thursday"
 *   "Family Saturday: Free with garden admission"
 */
export function extractSeattleJapaneseGardenCost(rawBody: string, summary: string): EventCost | undefined {
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

export default class SeattleJapaneseGardenRipper extends SquarespaceRipper {
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
                const cost = extractSeattleJapaneseGardenCost(rawBody, event.summary);
                if (cost !== undefined) event.cost = cost;
            }
        }
        return calendars;
    }
}
