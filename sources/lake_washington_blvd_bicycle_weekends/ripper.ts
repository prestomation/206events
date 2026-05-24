import { ZonedDateTime, Duration, LocalDate, LocalDateTime, ZoneId } from "@js-joda/core";
import { IRipper, Ripper, RipperCalendar, RipperCalendarEvent, RipperError, RipperEvent } from "../../lib/config/schema.js";
import '@js-joda/timezone';

const LOCATION = "Lake Washington Blvd S (Mt Baker Beach to Seward Park), Seattle, WA";

// Hardcoded annual schedule. Update each spring when the Seattle Mayor's
// office publishes the year's bicycle weekend dates — the press release
// URL changes year to year and the date list has exceptions (e.g. no
// Aug 1-2 in 2026 due to Seafair) plus holiday extensions that can't be
// represented as a clean weekly recurrence.
//
// Source: https://parkways.seattle.gov/2026/04/13/mayor-announces-bicycle-weekends-on-lake-washington-boulevard/
const SCHEDULE: Array<{ year: number; month: number; day: number }> = [
    // Memorial Day weekend (extended)
    { year: 2026, month: 5, day: 23 },
    { year: 2026, month: 5, day: 24 },
    { year: 2026, month: 5, day: 25 },
    { year: 2026, month: 5, day: 30 },
    { year: 2026, month: 5, day: 31 },
    { year: 2026, month: 6, day: 6 },
    { year: 2026, month: 6, day: 7 },
    { year: 2026, month: 6, day: 13 },
    { year: 2026, month: 6, day: 14 },
    { year: 2026, month: 6, day: 20 },
    { year: 2026, month: 6, day: 21 },
    { year: 2026, month: 6, day: 27 },
    { year: 2026, month: 6, day: 28 },
    // Fourth of July weekend (extended)
    { year: 2026, month: 7, day: 3 },
    { year: 2026, month: 7, day: 4 },
    { year: 2026, month: 7, day: 5 },
    { year: 2026, month: 7, day: 11 },
    { year: 2026, month: 7, day: 12 },
    { year: 2026, month: 7, day: 18 },
    { year: 2026, month: 7, day: 19 },
    { year: 2026, month: 7, day: 25 },
    { year: 2026, month: 7, day: 26 },
    // No Aug 1-2 due to Seafair
    { year: 2026, month: 8, day: 8 },
    { year: 2026, month: 8, day: 9 },
    { year: 2026, month: 8, day: 15 },
    { year: 2026, month: 8, day: 16 },
    { year: 2026, month: 8, day: 22 },
    { year: 2026, month: 8, day: 23 },
    { year: 2026, month: 8, day: 29 },
    { year: 2026, month: 8, day: 30 },
    // Labor Day weekend (extended)
    { year: 2026, month: 9, day: 5 },
    { year: 2026, month: 9, day: 6 },
    { year: 2026, month: 9, day: 7 },
];

const DESCRIPTION = [
    "A section of Lake Washington Boulevard from Mt Baker Beach to Seward Park is closed to motor vehicles for the day, open for walking, biking, rolling, and skating.",
    "The roadway is closed to cars continuously from 7pm Friday until 6am Monday on bicycle weekends. Residents and deliveries may access homes from the nearest cross street.",
].join("\n\n");

export default class LakeWashingtonBlvdBicycleWeekendsRipper implements IRipper {
    public async rip(ripper: Ripper): Promise<RipperCalendar[]> {
        const calendars: RipperCalendar[] = [];

        for (const cal of ripper.config.calendars) {
            const zone = ZoneId.of(cal.timezone.toString());
            const events = this.generateEvents(zone, LocalDate.now(), ripper.config.url.toString());

            calendars.push({
                name: cal.name,
                friendlyname: cal.friendlyname,
                events: events.filter((e): e is RipperCalendarEvent => "date" in e),
                errors: events.filter((e): e is RipperError => "type" in e),
                parent: ripper.config,
                tags: cal.tags || [],
            });
        }

        return calendars;
    }

    public generateEvents(zone: ZoneId, today: LocalDate, url: string): RipperEvent[] {
        const events: RipperEvent[] = [];

        for (const entry of SCHEDULE) {
            const eventDate = LocalDate.of(entry.year, entry.month, entry.day);
            if (eventDate.isBefore(today)) continue;

            // 8am-8pm window — captures useful daylight hours when people
            // actually use the car-free road. The road is technically closed
            // continuously from Fri 7pm to Mon 6am.
            const start = ZonedDateTime.of(
                LocalDateTime.of(entry.year, entry.month, entry.day, 8, 0),
                zone,
            );

            const id = `lake-wa-blvd-bicycle-weekend-${entry.year}-${String(entry.month).padStart(2, "0")}-${String(entry.day).padStart(2, "0")}`;

            const event: RipperCalendarEvent = {
                id,
                ripped: new Date(),
                date: start,
                duration: Duration.ofHours(12),
                summary: "Car-Free Lake Washington Blvd",
                description: DESCRIPTION,
                location: LOCATION,
                url,
            };

            events.push(event);
        }

        return events;
    }
}
