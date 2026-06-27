import { describe, it, expect } from 'vitest';
import { LocalDate } from '@js-joda/core';
import SeattleChamberMusicRipper from './ripper.js';

// Minimal HTML fixture with two event cards — one Concert Truck (location from title),
// one In-Person lecture (location = Center for Chamber Music).
const SAMPLE_HTML = `
<html>
<script>
var data = {"calendars":[{"entries":[
  {"title":"The Concert Truck – Gasworks Park","id":"4414","date":"06/20/2026","category":"summer-festival"},
  {"title":"American Classics In-Person Lecture","id":"4241","date":"06/23/2026","category":"education"},
  {"title":"American Classics Online Lecture","id":"4242","date":"06/23/2026","category":"education"},
  {}
]}]};
</script>
<div class="e-loop-item e-loop-item-4414">
  <div class='slider_event_item'>
    <h4>The Concert Truck &#8211; Gasworks Park</h4>
    <span class='event_item_info_date_time'>6:00 PM</span>
    <a class='event_item_link' href='https://www.seattlechambermusic.org/events/the-concert-truck-2-6-20-26/'>Learn More</a>
  </div>
</div>
<div class="e-loop-item e-loop-item-4241">
  <div class='slider_event_item'>
    <h4>American Classics In-Person Lecture</h4>
    <span class='event_item_info_date_time'>6:00 PM</span>
    <a class='event_item_link' href='https://www.seattlechambermusic.org/events/sf26-lecture1/'>Learn More</a>
  </div>
</div>
<a href="/events/page/2/"></a>
`;

const TRUCK_SCHEDULE_HTML = `
<ul class="elementor-icon-list-items">
  <li class="elementor-icon-list-item">
    <a href="https://www.seattlechambermusic.org/events/the-concert-truck-6-27-26/" target="_blank">
      <span class="elementor-icon-list-icon"><i class="fas fa-music-alt"></i></span>
      <span class="elementor-icon-list-text">Sat. June 27 | 12pm | Hing Hay Park</span>
    </a>
  </li>
  <li class="elementor-icon-list-item">
    <a href="https://www.seattlechambermusic.org/events/the-concert-truck-2-6-27-26/" target="_blank">
      <span class="elementor-icon-list-icon"><i class="fas fa-music-alt"></i></span>
      <span class="elementor-icon-list-text">Sat. June 27 | 7pm | Alki Beach Bathhouse</span>
    </a>
  </li>
  <li class="elementor-icon-list-item">
    <a href="https://www.seattlechambermusic.org/events/the-concert-truck-7-5-26/" target="_blank">
      <span class="elementor-icon-list-icon"><i class="fas fa-music-alt"></i></span>
      <span class="elementor-icon-list-text">Sun. July 5 | 1pm | Seattle Center* (Seattle Center Classical)</span>
    </a>
  </li>
  <li class="elementor-icon-list-item">
    <a href="https://www.seattlechambermusic.org/events/the-concert-truck-7-1-26/" target="_blank">
      <span class="elementor-icon-list-icon"><i class="fas fa-music-alt"></i></span>
      <span class="elementor-icon-list-text">Wed. July 1 | 12:30pm | Liberty Park*</span>
    </a>
  </li>
</ul>
`;

// Access private/public methods via cast to any for testing
const ripper = new SeattleChamberMusicRipper() as any;

describe('SeattleChamberMusicRipper', () => {
    describe('extractJson', () => {
        it('returns all entries from embedded JSON', () => {
            const entries = ripper.extractJson(SAMPLE_HTML);
            expect(entries).toHaveLength(4);
            expect(entries[0].id).toBe('4414');
            expect(entries[0].title).toBe('The Concert Truck – Gasworks Park');
            expect(entries[0].date).toBe('06/20/2026');
        });

        it('handles HTML entity decoding', () => {
            const html = `{"calendars":[{"entries":[{"title":"The Concert Truck &#8211; Seward Park","id":"4416","date":"06/21/2026","category":"summer-festival"}]}]}`;
            const entries = ripper.extractJson(html);
            expect(entries[0].title).toBe('The Concert Truck – Seward Park');
        });

        it('returns empty array when no calendars JSON present', () => {
            expect(ripper.extractJson('<html>no json here</html>')).toEqual([]);
        });
    });

    describe('extractCards', () => {
        it('extracts time and URL within each event block', () => {
            const cardData = new Map();
            ripper.extractCards(SAMPLE_HTML, cardData);
            expect(cardData.get('4414')?.time).toBe('6:00 PM');
            expect(cardData.get('4414')?.url).toContain('the-concert-truck-2-6-20-26');
            expect(cardData.get('4241')?.time).toBe('6:00 PM');
        });

        it('handles a card with no time element without misaligning other cards', () => {
            const htmlMissingTime = `
<div class="e-loop-item e-loop-item-100">
  <a class='event_item_link' href='https://example.com/event-a/'>More</a>
</div>
<div class="e-loop-item e-loop-item-200">
  <span class='event_item_info_date_time'>7:30 PM</span>
  <a class='event_item_link' href='https://example.com/event-b/'>More</a>
</div>`;
            const cardData = new Map();
            ripper.extractCards(htmlMissingTime, cardData);
            expect(cardData.get('100')?.time).toBeUndefined();
            expect(cardData.get('100')?.url).toContain('event-a');
            expect(cardData.get('200')?.time).toBe('7:30 PM');
            expect(cardData.get('200')?.url).toContain('event-b');
        });
    });

    describe('parseTime', () => {
        it('parses "H:MM AM/PM" format from main events page', () => {
            expect(ripper.parseTime('12:00 PM')).toEqual({ hour: 12, minute: 0 });
            expect(ripper.parseTime('6:00 PM')).toEqual({ hour: 18, minute: 0 });
            expect(ripper.parseTime('7:30 AM')).toEqual({ hour: 7, minute: 30 });
            expect(ripper.parseTime('12:00 AM')).toEqual({ hour: 0, minute: 0 });
        });

        it('parses compact "Ham/pm" format from Concert Truck schedule page', () => {
            expect(ripper.parseTime('12pm')).toEqual({ hour: 12, minute: 0 });
            expect(ripper.parseTime('6pm')).toEqual({ hour: 18, minute: 0 });
            expect(ripper.parseTime('11am')).toEqual({ hour: 11, minute: 0 });
            expect(ripper.parseTime('1pm')).toEqual({ hour: 13, minute: 0 });
            expect(ripper.parseTime('7pm')).toEqual({ hour: 19, minute: 0 });
        });

        it('parses compact "H:MMam/pm" format with minutes', () => {
            expect(ripper.parseTime('12:30pm')).toEqual({ hour: 12, minute: 30 });
            expect(ripper.parseTime('6:30pm')).toEqual({ hour: 18, minute: 30 });
        });

        it('returns null for unparseable input', () => {
            expect(ripper.parseTime('noon')).toBeNull();
            expect(ripper.parseTime('')).toBeNull();
        });
    });

    describe('extractTruckSchedule', () => {
        it('parses schedule entries from Concert Truck page', () => {
            const events = ripper.extractTruckSchedule(TRUCK_SCHEDULE_HTML);
            expect(events).toHaveLength(4);
        });

        it('extracts correct id, date, time, venue, and url', () => {
            const events = ripper.extractTruckSchedule(TRUCK_SCHEDULE_HTML);
            const first = events[0];
            expect(first.id).toBe('scms-the-concert-truck-6-27-26');
            expect(first.dateText).toBe('June 27');
            expect(first.timeText).toBe('12pm');
            expect(first.venue).toBe('Hing Hay Park');
            expect(first.url).toBe('https://www.seattlechambermusic.org/events/the-concert-truck-6-27-26/');
        });

        it('strips trailing asterisks and parenthetical notes from venue', () => {
            const events = ripper.extractTruckSchedule(TRUCK_SCHEDULE_HTML);
            // "Seattle Center* (Seattle Center Classical)" → "Seattle Center"
            const julyFive = events.find((e: any) => e.id === 'scms-the-concert-truck-7-5-26');
            expect(julyFive?.venue).toBe('Seattle Center');
            // "Liberty Park*" → "Liberty Park"
            const liberty = events.find((e: any) => e.id === 'scms-the-concert-truck-7-1-26');
            expect(liberty?.venue).toBe('Liberty Park');
        });

        it('parses time with minutes (12:30pm)', () => {
            const events = ripper.extractTruckSchedule(TRUCK_SCHEDULE_HTML);
            const liberty = events.find((e: any) => e.id === 'scms-the-concert-truck-7-1-26');
            expect(liberty?.timeText).toBe('12:30pm');
        });

        it('returns empty array for empty HTML', () => {
            expect(ripper.extractTruckSchedule('')).toEqual([]);
            expect(ripper.extractTruckSchedule('<html>no truck schedule</html>')).toEqual([]);
        });
    });

    describe('parseTruckEventDate', () => {
        const baseDate = LocalDate.of(2026, 6, 27);

        it('parses a future date in the same year', () => {
            const result = ripper.parseTruckEventDate('July 5', '1pm', baseDate);
            expect(result).toEqual({ year: 2026, month: 7, day: 5, hour: 13, minute: 0 });
        });

        it('parses the current date', () => {
            const result = ripper.parseTruckEventDate('June 27', '12pm', baseDate);
            expect(result).toEqual({ year: 2026, month: 6, day: 27, hour: 12, minute: 0 });
        });

        it('parses a date slightly in the past (within 6 months) as same year', () => {
            const result = ripper.parseTruckEventDate('June 18', '12pm', baseDate);
            expect(result).toEqual({ year: 2026, month: 6, day: 18, hour: 12, minute: 0 });
        });

        it('parses time with minutes', () => {
            const result = ripper.parseTruckEventDate('July 1', '12:30pm', baseDate);
            expect(result).toEqual({ year: 2026, month: 7, day: 1, hour: 12, minute: 30 });
        });

        it('parses evening times correctly', () => {
            const result = ripper.parseTruckEventDate('June 27', '7pm', baseDate);
            expect(result).toEqual({ year: 2026, month: 6, day: 27, hour: 19, minute: 0 });
        });

        it('returns null for invalid month', () => {
            expect(ripper.parseTruckEventDate('Julyyy 5', '1pm', baseDate)).toBeNull();
        });

        it('returns null for invalid time', () => {
            expect(ripper.parseTruckEventDate('July 5', 'noon', baseDate)).toBeNull();
        });

        it('returns null for malformed date text', () => {
            expect(ripper.parseTruckEventDate('Saturday', '1pm', baseDate)).toBeNull();
        });
    });

    describe('inferLocation', () => {
        it('extracts venue name from Concert Truck titles', () => {
            expect(ripper.inferLocation('The Concert Truck – Gasworks Park')).toBe('Gasworks Park');
            expect(ripper.inferLocation('The Concert Truck – Seward Park')).toBe('Seward Park');
        });

        it('returns Center for Chamber Music for in-person education events', () => {
            const center = '601 Union St, Seattle, WA 98101';
            expect(ripper.inferLocation('American Classics In-Person Lecture')).toBe(center);
            expect(ripper.inferLocation('Open Rehearsal – Summer Festival 2026')).toBe(center);
            expect(ripper.inferLocation('Sight Reading Party – Summer Festival 2026')).toBe(center);
        });

        it('returns Nordstrom Recital Hall for numbered festival concerts', () => {
            expect(ripper.inferLocation('Summer Festival Concert #1')).toContain('Benaroya Hall');
            expect(ripper.inferLocation('Summer Festival Concert #9')).toContain('Benaroya Hall');
        });

        it('returns Volunteer Park for community outdoor events', () => {
            expect(ripper.inferLocation('Community Play-Along')).toContain('Volunteer Park');
            expect(ripper.inferLocation('Chamber Music in the Park')).toContain('Volunteer Park');
        });

        it('returns named venue for named festival events', () => {
            expect(ripper.inferLocation('Summer Festival at Vashon Center for the Arts'))
                .toBe('Vashon Center for the Arts');
        });
    });
});
