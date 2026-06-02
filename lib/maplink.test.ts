import { describe, it, expect } from "vitest";
import { googleMapsUrl, osmFeatureUrl, geoUri, MapLinkInput } from "./maplink.js";

// ---------------------------------------------------------------------------
// PARITY FIXTURES — keep identical to web/src/maplink.test.js.
// Both suites assert the same inputs produce the same URLs; that's the
// contract that stops the TS builder (used for venues.json) and the JS
// builder (used in the browser) from silently diverging.
// ---------------------------------------------------------------------------
export const MAPLINK_CASES: Array<{
  name: string;
  input: MapLinkInput;
  google?: string;
  osm?: string;
  geo?: string;
}> = [
  {
    name: "venue with osm identity",
    input: {
      lat: 47.61,
      lng: -122.32,
      label: "Neumos, 925 E Pike St, Seattle, WA 98122",
      osmType: "way",
      osmId: 123456,
    },
    google:
      "https://www.google.com/maps/search/?api=1&query=Neumos%2C%20925%20E%20Pike%20St%2C%20Seattle%2C%20WA%2098122",
    osm: "https://www.openstreetmap.org/way/123456",
    geo: "geo:47.61,-122.32?q=Neumos%2C%20925%20E%20Pike%20St%2C%20Seattle%2C%20WA%2098122",
  },
  {
    name: "venue without osm identity",
    input: { lat: 47.6, lng: -122.33, label: "Some Hall, Seattle" },
    google:
      "https://www.google.com/maps/search/?api=1&query=Some%20Hall%2C%20Seattle",
    osm: undefined,
    geo: "geo:47.6,-122.33?q=Some%20Hall%2C%20Seattle",
  },
  {
    name: "event with location string only (no label)",
    input: { location: "The Crocodile, Belltown", lat: 47.614, lng: -122.346 },
    google:
      "https://www.google.com/maps/search/?api=1&query=The%20Crocodile%2C%20Belltown",
    osm: undefined,
    geo: "geo:47.614,-122.346?q=The%20Crocodile%2C%20Belltown",
  },
  {
    name: "coordinates only",
    input: { lat: 47.62, lng: -122.35 },
    google:
      "https://www.google.com/maps/search/?api=1&query=47.62%2C-122.35",
    osm: undefined,
    geo: "geo:47.62,-122.35?q=47.62%2C-122.35",
  },
  {
    name: "nothing usable",
    input: {},
    google: undefined,
    osm: undefined,
    geo: undefined,
  },
];

describe("maplink builders", () => {
  for (const c of MAPLINK_CASES) {
    it(`googleMapsUrl: ${c.name}`, () => {
      expect(googleMapsUrl(c.input)).toBe(c.google);
    });
    it(`osmFeatureUrl: ${c.name}`, () => {
      expect(osmFeatureUrl(c.input)).toBe(c.osm);
    });
    it(`geoUri: ${c.name}`, () => {
      expect(geoUri(c.input)).toBe(c.geo);
    });
  }

  it("osmFeatureUrl requires both osmType and osmId", () => {
    expect(osmFeatureUrl({ lat: 1, lng: 2, osmId: 5 })).toBeUndefined();
    expect(osmFeatureUrl({ lat: 1, lng: 2, osmType: "node" })).toBeUndefined();
    expect(osmFeatureUrl({ lat: 1, lng: 2, osmType: "node", osmId: 5 })).toBe(
      "https://www.openstreetmap.org/node/5",
    );
  });

  it("geoUri requires finite coordinates", () => {
    expect(geoUri({ label: "No coords here" })).toBeUndefined();
  });

  it("label is preferred over location for the query", () => {
    expect(
      googleMapsUrl({ label: "Real Venue", location: "fallback", lat: 1, lng: 2 }),
    ).toBe("https://www.google.com/maps/search/?api=1&query=Real%20Venue");
  });
});
