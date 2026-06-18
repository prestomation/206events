
import { describe, expect, test } from 'vitest';
import { readFile } from 'fs/promises';
import { parse } from 'node-html-parser';
import { Instant, ZoneRegion, ZonedDateTime } from '@js-joda/core';
import { RipperCalendarEvent, RipperEvent } from '../../lib/config/schema.js';
import NWMetalRipper from './ripper.js';


// The test passes Instant.ofEpochMilli(1715324400000) → ~2024-05-10 US/Pacific.
// Events JUN-NOV fall after that date, so they are assigned year 2024.
const FIXTURE_YEAR = 2024;

const expectedEvents = [
    {
        "summary": "3 Inches of Blood, Toxic Holocaust, Xoth",
        "date": `${FIXTURE_YEAR}-06-07T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox",
        "cost": { "paid": true }
    },
    {
        "summary": "Internal Realm (album release)",
        "date": `${FIXTURE_YEAR}-06-08T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": "Spiter, Desolus, Snakebite Kiss, Vaulderie",
        "date": `${FIXTURE_YEAR}-06-10T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Belltown Yacht Club",
        "cost": { "paid": true }
    },
    {
        "summary": "As I Lay Dying, Chelsea Grin, Entheos",
        "date": `${FIXTURE_YEAR}-07-13T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Temple Theatre (Tacoma)",
        "cost": { "paid": true }
    },
    {
        "summary": "Headless Bastard, Maxx Shredroom, Laserbeans",
        "date": `${FIXTURE_YEAR}-06-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "the Kraken Bar",
        "cost": { "paid": true }
    },
    {
        "summary": "BOTCH, Mortiferum, Caustic Wound",
        "date": `${FIXTURE_YEAR}-06-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox",
        "cost": { "paid": true }
    },
    {
        "summary": "Glyph, Empress, Tower Hill, Rope",
        "date": `${FIXTURE_YEAR}-06-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": "BOTCH, Helms Alee, Great Falls",
        "date": `${FIXTURE_YEAR}-06-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox",
        "cost": { "paid": true }
    },
    {
        "summary": "Death To All, Cryptopsy",
        "date": `${FIXTURE_YEAR}-06-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "The Crocodile",
        "cost": { "paid": true }
    },
    {
        "summary": "Death To All, Cryptopsy",
        "date": `${FIXTURE_YEAR}-06-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "The Crocodile",
        "cost": { "paid": true }
    },
    {
        "summary": "Exhumed, Skeletal Remains, Morbikon",
        "date": `${FIXTURE_YEAR}-06-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Madame Lou’s",
        "cost": { "paid": true }
    },
    {
        "summary": "Abrams, Goya, Sorcia",
        "date": `${FIXTURE_YEAR}-06-18T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Clock-Out Lounge",
        "cost": { "paid": true }
    },
    {
        "summary": "REZN, Mute Duo",
        "date": `${FIXTURE_YEAR}-06-19T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": "Sumac, White Boy Scream, Grave Infestation",
        "date": `${FIXTURE_YEAR}-06-22T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Clock-Out Lounge",
        "cost": { "paid": true }
    },
    {
        "summary": "A Skylit Drive, Silent Theory, What’s Wrong",
        "date": `${FIXTURE_YEAR}-06-22T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Funhouse",
        "cost": { "paid": true }
    },
    {
        "summary": "Gorgatron, Casket Robbery, Voraath",
        "date": `${FIXTURE_YEAR}-06-23T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Funhouse",
        "cost": { "paid": true }
    },
    {
        "summary": "Eternal, Skelm, Impertinence, Baptation",
        "date": `${FIXTURE_YEAR}-06-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Overkill Lounge (Tacoma)",
        "cost": { "paid": true }
    },
    {
        "summary": "Eternal, SerpentSpeech, Void Dancer, Resin Cough",
        "date": `${FIXTURE_YEAR}-06-26T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Jules Maes Saloon",
        "cost": { "paid": true }
    },
    {
        "summary": "Phrenelith, Witch Vomit, Noroth",
        "date": `${FIXTURE_YEAR}-06-27T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "High Water Mark (Portland)",
        "cost": { "paid": true }
    },
    {
        "summary": "Phrenelith, Excarnated Entity, Noroth, Degraved",
        "date": `${FIXTURE_YEAR}-06-28T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Jules Maes",
        "cost": { "paid": true }
    },
    {
        "summary": "Archspire, Aborted, Carcosa, Alluvial",
        "date": `${FIXTURE_YEAR}-06-29T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Mizmor, Tithe",
        "date": `${FIXTURE_YEAR}-07-06T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": "Eight Bells, Serpentent, Izthmi",
        "date": `${FIXTURE_YEAR}-07-06T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Belltown Yacht Club",
        "cost": { "paid": true }
    },
    {
        "summary": "Red Fang, Spoon Benders",
        "date": `${FIXTURE_YEAR}-07-11T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox",
        "cost": { "paid": true }
    },
    {
        "summary": "Yob, Sandrider",
        "date": `${FIXTURE_YEAR}-07-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Arkaik, Cyborg Octopus, Dessiderium",
        "date": `${FIXTURE_YEAR}-07-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Funhouse",
        "cost": { "paid": true }
    },
    {
        "summary": "Necrot, Phobophilic, Street Tombs, Witch Vomit",
        "date": `${FIXTURE_YEAR}-07-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Clock-Out Lounge",
        "cost": { "paid": true }
    },
    {
        "summary": "A Day To Remember, The Story So Far, Four Year Strong, Scowl",
        "date": `${FIXTURE_YEAR}-07-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "WAMU Theater",
        "cost": { "paid": true }
    },
    {
        "summary": "Fallujah, Persefone, Vulvodynia, Dawn of Ouroboros",
        "date": `${FIXTURE_YEAR}-07-19T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Pallbearer, Inter Arma, The Keening",
        "date": `${FIXTURE_YEAR}-07-19T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": "Toxic Reign, Schmutzhund, Distest",
        "date": `${FIXTURE_YEAR}-07-20T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "the Kraken Bar",
        "cost": { "paid": true }
    },
    {
        "summary": "Primus, Coheed and Cambria, Guerilla Toss",
        "date": `${FIXTURE_YEAR}-07-20T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Spokane Pavilion",
        "cost": { "paid": true }
    },
    {
        "summary": "Ragana, Agriculture",
        "date": `${FIXTURE_YEAR}-07-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Madame Lou’s",
        "cost": { "paid": true }
    },
    {
        "summary": "Tithe, Vulnere, Vile Rites, Villainous Temple",
        "date": `${FIXTURE_YEAR}-07-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "High Water Mark (Portland)",
        "cost": { "paid": true }
    },
    {
        "summary": "Cloud Rat, Mem//Brane, Baring Teeth, Flesh Produce",
        "date": `${FIXTURE_YEAR}-07-27T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Black Lodge",
        "cost": { "paid": true }
    },
    {
        "summary": "Tithe, Vulnere, Vile Rites, Baptation",
        "date": `${FIXTURE_YEAR}-07-28T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Overkill Lounge (Tacoma)",
        "cost": { "paid": true }
    },
    {
        "summary": "King Buzzo, Trevor Dunn, JD Pinkus",
        "date": `${FIXTURE_YEAR}-08-10T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Neumos",
        "cost": { "paid": true }
    },
    {
        "summary": "Megadeth, Mudvayne, All That Remains",
        "date": `${FIXTURE_YEAR}-08-12T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "White River Ampitheatre (Auburn)",
        "cost": { "paid": true }
    },
    {
        "summary": "Skinlab, Short Fuse, Another Demon",
        "date": `${FIXTURE_YEAR}-08-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Anvil, Serpent Rider, Pulsifier, more",
        "date": `${FIXTURE_YEAR}-08-15T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": "Lamb of God, Mastodon, Kerry King, Malevolence",
        "date": `${FIXTURE_YEAR}-08-17T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showare Center",
        "cost": { "paid": true }
    },
    {
        "summary": " Mastodon, Lamb of God, Kerry King, Malevolence",
        "date": `${FIXTURE_YEAR}-08-18T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Theater of the Clouds, Moda Center (Portland)",
        "cost": { "paid": true }
    },
    {
        "summary": "Haunt, Savage Master, Vanishment",
        "date": `${FIXTURE_YEAR}-08-23T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Red Mesa, Sorcia",
        "date": `${FIXTURE_YEAR}-08-24T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": "In This Moment, Avatar, TX2",
        "date": `${FIXTURE_YEAR}-08-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "The Moore Theatre",
        "cost": { "paid": true }
    },
    {
        "summary": "Goatwhore, Vitriol, Thantifaxath",
        "date": `${FIXTURE_YEAR}-08-25T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Dante’s (Portland)",
        "cost": { "paid": true }
    },
    {
        "summary": "Goatwhore, Vitriol, Thantifaxath",
        "date": `${FIXTURE_YEAR}-08-27T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Substation",
        "cost": { "paid": true }
    },
    {
        "summary": " Metallica, Pantera, Mammoth WVH",
        "date": `${FIXTURE_YEAR}-08-30T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Lumen Field",
        "cost": { "paid": true }
    },
    {
        "summary": " Metallica, Five Finger Death Punch, Ice Nine Kills",
        "date": `${FIXTURE_YEAR}-09-01T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Lumen Field",
        "cost": { "paid": true }
    },
    {
        "summary": "Have A Nice Life, Mamaleek, Jenny Haniver",
        "date": `${FIXTURE_YEAR}-09-01T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox",
        "cost": { "paid": true }
    },
    {
        "summary": "Molder, Dripping Decay, Decaying Crypt",
        "date": `${FIXTURE_YEAR}-09-03T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Belltown Yacht Club",
        "cost": { "paid": true }
    },
    {
        "summary": "Signs of the Swarm, Cane Hill, Ov Sulfur, 156/Silence, A Wake In Providence",
        "date": `${FIXTURE_YEAR}-09-11T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Testament, Kreator, Possessed",
        "date": `${FIXTURE_YEAR}-09-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox SoDo",
        "cost": { "paid": true }
    },
    {
        "summary": "Mortiis, Sombre Arcane, Malfet",
        "date": `${FIXTURE_YEAR}-09-17T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Amorphis, Dark Tranquillity, Fires In The Distance",
        "date": `${FIXTURE_YEAR}-09-22T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Boris, Starcrawler",
        "date": `${FIXTURE_YEAR}-10-02T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox",
        "cost": { "paid": true }
    },
    {
        "summary": "Korn, Gojira, Spiritbox",
        "date": `${FIXTURE_YEAR}-10-08T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "MODA Center (Portland)",
        "cost": { "paid": true }
    },
    {
        "summary": "Carnifex, Mental Cruelty, Organectomy, Heavy Hitter",
        "date": `${FIXTURE_YEAR}-10-09T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Korn, Gojira, Spiritbox",
        "date": `${FIXTURE_YEAR}-10-10T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Tacoma Dome (Tacoma)",
        "cost": { "paid": true }
    },
    {
        "summary": "Miss May I, In Hearts Wake, Traitors, Bloom",
        "date": `${FIXTURE_YEAR}-10-11T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    },
    {
        "summary": "Iron Maiden, The Hu",
        "date": `${FIXTURE_YEAR}-10-14T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "MODA Center (Portland)",
        "cost": { "paid": true }
    },
    {
        "summary": "Iron Maiden, The Hu",
        "date": `${FIXTURE_YEAR}-10-16T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Tacoma Dome (Tacoma)",
        "cost": { "paid": true }
    },
    {
        "summary": "Hatebreed, Carcass, Harms Way, Crypta",
        "date": `${FIXTURE_YEAR}-10-20T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox SoDo",
        "cost": { "paid": true }
    },
    {
        "summary": "Death Angel, W.A.S.P., Unto Others",
        "date": `${FIXTURE_YEAR}-10-29T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Moore Theatre",
        "cost": { "paid": true }
    },
    {
        "summary": "Animals As Leaders, Plini",
        "date": `${FIXTURE_YEAR}-10-31T19:00-07:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "Showbox",
        "cost": { "paid": true }
    },
    {
        "summary": "Morbid Angel, Suffocation, Uada, Mortiferum, Fulci, Knoll",
        "date": `${FIXTURE_YEAR}-11-30T19:00-08:00[US/Pacific]`,
        "duration": "PT4H",
        "location": "El Corazon",
        "cost": { "paid": true }
    }
]

describe('SAF', () => {
    test('Read a static test HTML file and ensure the events we get back are as expected', async () => {
        const exampleData = await readFile("sources/nw_metal_calendar/nwmetal-2024-06-10.html");
        const exampleHTML = parse(exampleData.toString());
        const safRipper = new NWMetalRipper();
        const events: RipperEvent[] = await safRipper.parseEvents(exampleHTML, ZonedDateTime.ofInstant(Instant.ofEpochMilli(1715324400000), ZoneRegion.of("US/Pacific")), {});
        const rippedRemoved: RipperCalendarEvent[] = events.filter(e => "ripped" in e).map(e => {
            delete (e as any).ripped;
            return e as RipperCalendarEvent;
        });
        expect(JSON.parse(JSON.stringify(rippedRemoved))).toEqual(expectedEvents);
    })
});