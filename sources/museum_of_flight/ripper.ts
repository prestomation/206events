import { IRipper, Ripper, RipperCalendar } from "../../lib/config/schema.js";

// Implementation in progress — placeholder until full ripper is written.
export default class MuseumOfFlightRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        return ripper.config.calendars.map(c => ({
            name: c.name,
            friendlyname: c.friendlyname,
            events: [],
            errors: [{
                type: "ParseError" as const,
                reason: "Implementation pending",
                context: ripper.config.url.toString()
            }],
            parent: ripper.config,
            tags: c.tags || []
        }));
    }
}
