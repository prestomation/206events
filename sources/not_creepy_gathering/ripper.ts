import { parse } from 'node-html-parser';
import { EventCost, Ripper, RipperCalendar, RipperCalendarEvent, UncertaintyError } from "../../lib/config/schema.js";
import { SquarespaceEvent, SquarespaceRipper } from "../../lib/config/squarespace.js";

// Deterministic hash for partialFingerprint — stability only, not security.
function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}

// The Not-Creepy Gathering also runs a Bellingham chapter (~90mi north of
// Seattle, hosted at "Wink Wink"). Filter those out to keep this source
// focused on the Seattle events (Fremont Abbey, Ballard Homestead, etc.)
// that make up the majority of the calendar.
export function isBellingham(sqEvent: SquarespaceEvent): boolean {
    return /bellingham|wink ?wink/i.test(sqEvent.title);
}

const KNOWN_VENUES: { pattern: RegExp; location: string }[] = [
    { pattern: /fremont abbey/i, location: "Fremont Abbey, Seattle, WA" },
    { pattern: /ballard homestead/i, location: "Ballard Homestead, Seattle, WA" },
];

// Squarespace's structured `location` field is unset for this source (it
// carries a stale default, not a real address) — the actual venue is only
// mentioned in the freeform event body, e.g. "At the Fremont Abbey!".
export function extractLocation(bodyText: string): string | undefined {
    return KNOWN_VENUES.find(v => v.pattern.test(bodyText))?.location;
}

// Pricing is announced in the body text (e.g. "$10-$30 Sliding Scale"),
// not in a structured field.
export function extractCost(bodyText: string): EventCost | undefined {
    const range = bodyText.match(/\$(\d+(?:\.\d{2})?)\s*-\s*\$?(\d+(?:\.\d{2})?)/);
    if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
    const single = bodyText.match(/\$(\d+(?:\.\d{2})?)/);
    if (single) return { min: parseFloat(single[1]) };
    if (/\bfree\b/i.test(bodyText)) return { min: 0 };
    return undefined;
}

// Body text didn't match a known venue — surface it via the uncertainty
// system (docs/event-uncertainty.md) rather than shipping a silent gap.
export function buildLocationUncertainty(
    sourceName: string,
    calendarName: string,
    event: RipperCalendarEvent,
    bodyText: string,
): UncertaintyError {
    return {
        type: "Uncertainty",
        reason: "Could not extract a known venue from the event body",
        source: sourceName,
        calendar: calendarName,
        unknownFields: ["location"],
        event,
        partialFingerprint: simpleHash(bodyText),
    };
}

function stripToText(html: string): string {
    const root = parse(html);
    root.querySelectorAll('style, script').forEach(el => el.remove());
    return root.structuredText.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim();
}

export default class NotCreepyGatheringRipper extends SquarespaceRipper {
    private sqEvents: SquarespaceEvent[] = [];

    protected override async fetchUpcomingEvents(baseUrl: URL): Promise<SquarespaceEvent[]> {
        const events = await super.fetchUpcomingEvents(baseUrl);
        this.sqEvents = events.filter(e => !isBellingham(e));
        return this.sqEvents;
    }

    public override async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars = await super.rip(ripper);
        const bodyMap = new Map(this.sqEvents.map(e => [e.id, e.body || '']));

        for (const cal of calendars) {
            for (const event of cal.events) {
                const bodyText = stripToText(event.id ? (bodyMap.get(event.id) ?? '') : '');
                if (!bodyText) continue;

                if (!event.description) event.description = bodyText;
                if (!event.location) {
                    const location = extractLocation(bodyText);
                    if (location) {
                        event.location = location;
                    } else {
                        cal.errors.push(buildLocationUncertainty(ripper.config.name, cal.name, event, bodyText));
                    }
                }
                if (event.cost === undefined) {
                    const cost = extractCost(bodyText);
                    if (cost !== undefined) event.cost = cost;
                }
            }
        }

        return calendars;
    }
}
