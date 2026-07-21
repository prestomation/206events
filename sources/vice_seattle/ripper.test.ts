import { describe, it, expect } from "vitest";
import { parse } from "node-html-parser";
import { readFileSync } from "fs";
import { join } from "path";

// Import the ripper to test the parsing logic
import ViceSeattleRipper from "./ripper.js";

const SAMPLE_HTML = `
<table class="uv-calendar-table">
  <tbody>
    <tr>
      <td class=" uvtddate-2026-07-24 uvsingleevent">
        <div class="datelabel">Jul 24</div>
        <div class="cellcont">
          <a href="/microsite/vicesea/event/2786/1495647/white-rabbit-group-fridays?eventcode=EVE149564700020260724"
             class="flyer uvev-sdate-260724 uvev-eco-ECZ0"
             data-folder="https://venueeventartist.com/imateq/event/512/1495647/40941972092"
             data-file="40996189350.jpeg">
            <div class="uv-flyerbg uv-rat-Square" style="background-image: url(https://venueeventartist.com/imateq/event/512/1495647/40941972092/300SC0/40996189350.jpeg);"></div>
            <div class="uv-event-title">WHITE RABBIT GROUP FRIDAYS</div>
          </a>
        </div>
      </td>
      <td class=" uvtddate-2026-07-25 uvsingleevent">
        <div class="datelabel">Jul 25</div>
        <div class="cellcont">
          <a href="/microsite/vicesea/event/2786/1495647/shake-saturdays?eventcode=EVE149564700020260725"
             class="flyer uvev-sdate-260725 uvev-eco-ECZ0"
             data-folder="https://venueeventartist.com/imateq/event/512/1495647/2341611"
             data-file="401049107428.jpeg">
            <div class="uv-flyerbg uv-rat-Square" style="background-image: url(https://venueeventartist.com/imateq/event/512/1495647/2341611/300SC0/401049107428.jpeg);"></div>
            <div class="uv-event-title">SHAKE SATURDAYS</div>
          </a>
        </div>
      </td>
      <td class=" uvtddate-2026-07-26 uvsingleevent">
        <div class="datelabel">Jul 26</div>
        <div class="cellcont">Book</div>
      </td>
      <td class=" uvtddate-2026-07-28 uvsingleevent">
        <div class="datelabel">Jul 28</div>
        <div class="cellcont">
          <a href="/microsite/vicesea/event/2786/1495647/two-dollar-tuesdays-dj-s-cash-beer-pong-tournament?eventcode=EVE149564700020260728"
             class="flyer uvev-sdate-260728 uvev-eco-ECZ0"
             data-folder="https://venueeventartist.com/imateq/event/512/1495647/401002647473"
             data-file="401002647610.jpeg">
            <div class="uv-flyerbg uv-rat-Square" style="background-image: url(https://venueeventartist.com/imateq/event/512/1495647/401002647473/300SC0/401002647610.jpeg);"></div>
            <div class="uv-event-title">Two Dollar Tuesdays - DJ's + cash Beer Pong Tournament</div>
          </a>
        </div>
      </td>
    </tr>
  </tbody>
</table>
`;

describe("ViceSeattleRipper", () => {
    it("should parse all event cells from the booketing calendar", () => {
        const ripper = new ViceSeattleRipper();
        // Access the private method via any to test parsing logic
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html);

        // Should have 3 events (skip the "Book" cell with no link)
        expect(events.length).toBe(3);
    });

    it("should extract correct event titles", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        const titles = events.map(e => e.summary);
        expect(titles).toContain("WHITE RABBIT GROUP FRIDAYS");
        expect(titles).toContain("SHAKE SATURDAYS");
        expect(titles).toContain("Two Dollar Tuesdays - DJ's + cash Beer Pong Tournament");
    });

    it("should extract correct event IDs from eventcode", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        expect(events[0].id).toBe("vice-seattle-EVE149564700020260724");
        expect(events[1].id).toBe("vice-seattle-EVE149564700020260725");
        expect(events[2].id).toBe("vice-seattle-EVE149564700020260728");
    });

    it("should extract correct dates", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        // All events should have date as ZonedDateTime
        expect(events[0].date.toString()).toContain("2026-07-24");
        expect(events[1].date.toString()).toContain("2026-07-25");
        expect(events[2].date.toString()).toContain("2026-07-28");
    });

    it("should set start time to 9:30 PM Pacific", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        for (const event of events) {
            expect(event.date.hour()).toBe(21);
            expect(event.date.minute()).toBe(30);
        }
    });

    it("should extract image URLs from data attributes", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        expect(events[0].imageUrl).toBe("https://venueeventartist.com/imateq/event/512/1495647/40941972092/500SC0/40996189350.jpeg");
        expect(events[1].imageUrl).toBe("https://venueeventartist.com/imateq/event/512/1495647/2341611/500SC0/401049107428.jpeg");
    });

    it("should set the correct location", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        for (const event of events) {
            expect(event.location).toBe("VICE Seattle, 1532 Minor Ave, Seattle, WA 98101");
        }
    });

    it("should set cost to paid", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        for (const event of events) {
            expect(event.cost).toEqual({ paid: true });
        }
    });

    it("should include event detail URL in description", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        expect(events[0].description).toContain("https://booketing.com/microsite/vicesea/event/2786/1495647/white-rabbit-group-fridays");
        expect(events[0].url).toBe("https://booketing.com/microsite/vicesea/event/2786/1495647/white-rabbit-group-fridays?eventcode=EVE149564700020260724");
    });

    it("should skip cells with no event link (Book only)", () => {
        const ripper = new ViceSeattleRipper();
        const html = parse(SAMPLE_HTML);
        const events = (ripper as any).parseAllEvents(html) as any[];

        // The "Book" cell for Jul 26 should not produce an event
        const hasJul26 = events.some(e => e.date?.toString()?.includes("2026-07-26"));
        expect(hasJul26).toBe(false);
    });

    it("should deduplicate events by eventcode", () => {
        const ripper = new ViceSeattleRipper();
        // Parse the same HTML twice to test dedup
        const html = parse(SAMPLE_HTML);
        const events1 = (ripper as any).parseAllEvents(html) as any[];
        // Second parse should return empty since all eventcodes are seen
        const events2 = (ripper as any).parseAllEvents(html) as any[];
        expect(events1.length).toBe(3);
        expect(events2.length).toBe(0);
    });
});