
import { describe, expect, test } from 'vitest';
import { readFile } from 'fs/promises';

import SIFFRipper from './ripper.js';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';

const calendars = [{
    config: {
        name: "SIFF Cinema Downtown",
        cssSelector: ".Downtown"
    },
    events: [{ "description": "", "summary": "Música!", "url": "https://www.siff.net/festival/musica", "location": "SIFF Cinema Downtown", "date": "2024-05-10T13:15-07:00[US/Pacific]", "duration": "PT1H12M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/Msica.jpg", "cost": { "paid": true } },
    { "description": "", "summary": "Songs of Earth", "url": "https://www.siff.net/festival/songs-of-earth",  "location": "SIFF Cinema Downtown", "date": "2024-05-10T15:30-07:00[US/Pacific]", "duration": "PT1H31M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/SongsOfEarth.jpg", "cost": { "paid": true } },
    { "description": "", "summary": "Janet Planet", "url": "https://www.siff.net/festival/janet-planet", "location": "SIFF Cinema Downtown", "date": "2024-05-10T18:00-07:00[US/Pacific]", "duration": "PT1H53M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/JanetPlanet.jpg", "cost": { "paid": true } },
    { "description": "", "summary": "Scorched Earth", "url": "https://www.siff.net/festival/scorched-earth", "location": "SIFF Cinema Downtown", "date": "2024-05-10T20:45-07:00[US/Pacific]", "duration": "PT1H41M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/ScorchedEarth.jpg", "cost": { "paid": true } }
    ]
}, {
    config: {
        name: "SIFF Cinema Uptown",
        cssSelector: ".Uptown",
    },
    events: [
        { "description": "", "summary": "Woodland", "url": "https://www.siff.net/festival/woodland","location": "SIFF Cinema Uptown", "date": "2024-05-10T12:30-07:00[US/Pacific]", "duration": "PT1H40M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/Woodland.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "Agent of Happiness", "url": "https://www.siff.net/festival/agent-of-happiness", "location": "SIFF Cinema Uptown", "date": "2024-05-10T15:30-07:00[US/Pacific]", "duration": "PT1H33M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/AgentOfHappiness.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "So This Is Christmas", "url": "https://www.siff.net/festival/so-this-is-christmas", "location": "SIFF Cinema Uptown", "date": "2024-05-10T18:00-07:00[US/Pacific]", "duration": "PT1H30M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/SoThisIsChristmas.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "The Queen of My Dreams", "url": "https://www.siff.net/festival/the-queen-of-my-dreams", "location": "SIFF Cinema Uptown", "date": "2024-05-10T20:30-07:00[US/Pacific]", "duration": "PT1H37M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/QueenOfMyDreams.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "Hajjan", "url": "https://www.siff.net/festival/hajjan", "location": "SIFF Cinema Uptown", "date": "2024-05-10T13:00-07:00[US/Pacific]", "duration": "PT2H2M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/Hajjan.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "Dancing on the Edge of a Volcano", "url": "https://www.siff.net/festival/dancing-on-the-edge-of-a-volcano", "location": "SIFF Cinema Uptown", "date": "2024-05-10T16:00-07:00[US/Pacific]", "duration": "PT1H24M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/DancingTheOnEdgeOfAVolcano.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "Terrestrial Verses", "url": "https://www.siff.net/festival/terrestrial-verses", "location": "SIFF Cinema Uptown", "date": "2024-05-10T18:30-07:00[US/Pacific]", "duration": "PT1H17M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/TerrestrialVerses.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "Black Box Diaries", "url": "https://www.siff.net/festival/black-box-diaries", "location": "SIFF Cinema Uptown", "date": "2024-05-10T21:00-07:00[US/Pacific]", "duration": "PT1H44M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/BlackBoxDiaries.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "A Journey in Spring", "url": "https://www.siff.net/festival/a-journey-in-spring", "location": "SIFF Cinema Uptown", "date": "2024-05-10T13:30-07:00[US/Pacific]", "duration": "PT1H30M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/JourneyInSpring.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "Àma Gloria", "url": "https://www.siff.net/festival/ama-gloria", "location": "SIFF Cinema Uptown", "date": "2024-05-10T16:30-07:00[US/Pacific]", "duration": "PT1H24M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/maGloria.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "ShortsFest Opening Night", "url": "https://www.siff.net/festival/shortsfest-opening-night-x37524", "location": "SIFF Cinema Uptown", "date": "2024-05-10T19:00-07:00[US/Pacific]", "duration": "PT1H24M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Short%20Film%20Detail%20Hero%20Sizes/EssexGirls.jpg", "cost": { "paid": true } },
        { "description": "", "summary": "Tim Travers and the Time Traveler’s Paradox", "url": "https://www.siff.net/festival/tim-travers-and-the-time-travelers-paradox", "location": "SIFF Cinema Uptown", "date": "2024-05-10T21:30-07:00[US/Pacific]", "duration": "PT1H43M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/TimTraversandTheTimeTravelersParadox.jpg", "cost": { "paid": true } }
    ]
}, {
    config: {
        name: "SIFF Cinema Egyptian",
        cssSelector: ".Egyptian"
    },
    events: [{ "description": "", "summary": "I Told You So", "url": "https://www.siff.net/festival/i-told-you-so", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T13:30-07:00[US/Pacific]", "duration": "PT1H40M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/ITOLDYOUSO.jpg", "cost": { "paid": true } },
    { "description": "", "summary": "Tony, Shelly and The Magic Light", "url": "https://www.siff.net/festival/tony-shelly-and-the-magic-light", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T16:15-07:00[US/Pacific]", "duration": "PT1H22M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/TonyShellyAndTheMagicLight.jpg", "cost": { "paid": true } },
    { "description": "", "summary": "Luther: Never Too Much", "url": "https://www.siff.net/festival/luther-never-too-much", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T18:30-07:00[US/Pacific]", "duration": "PT1H41M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/LutherNeverTooMuch.jpg", "cost": { "paid": true } },
    { "description": "", "summary": "I Saw the TV Glow", "url": "https://www.siff.net/festival/i-saw-the-tv-glow", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T21:15-07:00[US/Pacific]", "duration": "PT1H40M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/ISawTheTVGlow.jpg", "cost": { "paid": true } },
    { "description": "", "summary": "The Primevals", "url": "https://www.siff.net/festival/the-primevals", "location": "SIFF Cinema Egyptian", "date": "2024-05-10T23:59-07:00[US/Pacific]", "duration": "PT1H30M", "imageUrl": "https://www.siff.net/images/FESTIVAL/2024/Films/Film%20Detail%20Hero%20Sizes/Features/Primevals.jpg", "cost": { "paid": true } }
    ]
}];

describe('SIFF', () => {
    test('Read a static test HTML file and ensure the events we get back are as expected', async () => {
        const exampleData = await readFile("sources/siff/siff-2024-05-10.html");
        const exampleHTML = parse(exampleData.toString());
        const siffRipper = new SIFFRipper();
        for (const calendar of calendars) {

            const events: RipperEvent[] = await siffRipper.parseEvents(exampleHTML, ZonedDateTime.ofInstant(Instant.ofEpochMilli(1715324400000), ZoneRegion.of("US/Pacific")), calendar.config);
            const rippedRemoved: RipperCalendarEvent[] = events.filter(e => "ripped" in e).map(e => {
                delete (e as any).ripped;
                return e as RipperCalendarEvent;
            });
            expect(JSON.parse(JSON.stringify(rippedRemoved))).toEqual(calendar.events);

        }
    });
});