
import { describe, expect, test } from 'vitest';
import { readFile } from 'fs/promises';
import SAFRipper from './ripper.js';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';


const currentYear = new Date().getFullYear();  

const expectedEvents = [
    {
        "cost": { "paid": true },
        "id": "148059047",
        "summary": "2024 Family Workshops",
        "date": `${currentYear}-02-02T10:00-08:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/148059047/2024-family-workshops"
    },
    {
        "cost": { "paid": true },
        "id": "151911832",
        "summary": "Columbia City: Expect Random Encounters",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911832/columbia-city-expect-random-encounters"
    },
    {
        "cost": { "paid": true },
        "id": "151912082",
        "summary": "Federal Avenue: Understated Elegance on the Park",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912082/federal-avenue-understated-elegance-on-the-park"
    },
    {
        "cost": { "paid": true },
        "id": "151911627",
        "summary": "Mt. Baker: More Than a View",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911627/mt-baker-more-than-a-view"
    },
    {
        "cost": { "paid": true },
        "id": "148056219",
        "summary": "Piers ⎮ Family Workshop",
        "date": `${currentYear}-06-01T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/148056219/piers-family-workshop"
    },
    {
        "cost": { "paid": true },
        "id": "151912280",
        "summary": "Ballard Landmark District",
        "date": `${currentYear}-06-07T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912280/ballard-landmark-district"
    },
    {
        "cost": { "paid": true },
        "id": "151912328",
        "summary": "From Stone to Steel: Seattle Style from Then ‘til Now",
        "date": `${currentYear}-06-08T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912328/from-stone-to-steel-seattle-style-from-then-til-now"
    },
    {
        "cost": { "paid": true },
        "id": "151912680",
        "summary": "Diamonds & Gold: The Art Deco Skyscraper Northwest Style",
        "date": `${currentYear}-06-08T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912680/diamonds-gold-the-art-deco-skyscraper-northwest-style"
    },
    {
        "cost": { "paid": true },
        "id": "151912822",
        "summary": "Harvard Belmont District: The Rich Life on Capitol Hill",
        "date": `${currentYear}-06-08T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912822/harvard-belmont-district-the-rich-life-on-capitol-hill"
    },
    {
        "cost": { "paid": true },
        "id": "151913006",
        "summary": "Queen Anne: Evolution of an Urban Neighborhood",
        "date": `${currentYear}-06-15T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913006/queen-anne-evolution-of-an-urban-neighborhood"
    },
    {
        "cost": { "paid": true },
        "id": "151913299",
        "summary": "South Lake Union: Then & Now",
        "date": `${currentYear}-06-15T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913299/south-lake-union-then-now"
    },
    {
        "cost": { "paid": true },
        "id": "152057297",
        "summary": "Seattle Skyline: History, Context & Culture",
        "date": `${currentYear}-06-22T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/152057297/seattle-skyline-history-context-culture"
    },
    {
        "cost": { "paid": true },
        "id": "151913438",
        "summary": "Through the Looking Glass",
        "date": `${currentYear}-06-22T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151913438/through-the-looking-glass"
    },
    {
        "cost": { "paid": true },
        "id": "152763162",
        "summary": "Hidden Spaces/Public Places",
        "date": `${currentYear}-06-28T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/152763162/hidden-spaces-public-places"
    },
    {
        "cost": { "paid": true },
        "id": "151829264",
        "summary": "Purple & Gold: From Gothic to Modern at the UW Core",
        "date": `${currentYear}-06-28T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151829264/purple-gold-from-gothic-to-modern-at-the-uw-core"
    },
    {
        "cost": { "paid": true },
        "id": "151911848",
        "summary": "Columbia City: Expect Random Encounters",
        "date": `${currentYear}-07-06T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151911848/columbia-city-expect-random-encounters"
    },
    {
        "cost": { "paid": true },
        "id": "151912663",
        "summary": "Diamonds & Gold: The Art Deco Skyscraper Northwest Style",
        "date": `${currentYear}-07-06T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912663/diamonds-gold-the-art-deco-skyscraper-northwest-style"
    },
    {
        "cost": { "paid": true },
        "id": "151912999",
        "summary": "Queen Anne: Evolution of an Urban Neighborhood",
        "date": `${currentYear}-07-06T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912999/queen-anne-evolution-of-an-urban-neighborhood"
    },
    {
        "cost": { "paid": true },
        "id": "151912575",
        "summary": "Ballard Landmark District",
        "date": `${currentYear}-07-12T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912575/ballard-landmark-district"
    },
    {
        "cost": { "paid": true },
        "id": "151912369",
        "summary": "From Stone to Steel: Seattle Style from Then ‘til Now",
        "date": `${currentYear}-07-13T10:00-07:00[America/Los_Angeles]`,
        "duration": "PT2H",
        "url": "https://seattlearchitecture.strangertickets.com/events/151912369/from-stone-to-steel-seattle-style-from-then-til-now"
    }
]

describe('SAF', () => {
    test('Read a static test HTML file and ensure the events we get back are as expected', async () => {
        const exampleData = await readFile("sources/seattlearchitecture/saf-2024-05-29.html");
        const exampleHTML = parse(exampleData.toString());
        const safRipper = new SAFRipper();
        const events: RipperEvent[] = await safRipper.parseEvents(exampleHTML, ZonedDateTime.ofInstant(Instant.ofEpochMilli(1715324400000), ZoneRegion.of("US/Pacific")), {});
        const rippedRemoved: RipperCalendarEvent[] = events.filter(e => "ripped" in e).map(e => {
            delete (e as any).ripped;
            return e as RipperCalendarEvent;
        });
        expect(JSON.parse(JSON.stringify(rippedRemoved))).toEqual(expectedEvents);
    })
});