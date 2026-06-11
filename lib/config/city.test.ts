import { describe, it, expect } from "vitest";
import rawCityConfig from "../../city.config.js";
import { CITY, validateCityConfig } from "./city.js";

describe("city.config.ts", () => {
    it("parses against the schema", () => {
        expect(() => validateCityConfig(rawCityConfig)).not.toThrow();
    });

    it("exports the validated config as CITY", () => {
        expect(CITY.site.name).toBe(rawCityConfig.site.name);
        expect(CITY.neighborhoods).toEqual(rawCityConfig.neighborhoods);
    });

    it("keeps baseUrl/productionUrl slash conventions", () => {
        expect(CITY.site.baseUrl.endsWith("/")).toBe(true);
        expect(CITY.site.productionUrl.endsWith("/")).toBe(false);
    });

    it("keeps the map center inside the clamp bounds inside the sanity bbox", () => {
        const { center, clampBounds } = CITY.map;
        const bbox = CITY.venueSanityBbox;
        expect(center.lat).toBeGreaterThanOrEqual(clampBounds.south);
        expect(center.lat).toBeLessThanOrEqual(clampBounds.north);
        expect(center.lng).toBeGreaterThanOrEqual(clampBounds.west);
        expect(center.lng).toBeLessThanOrEqual(clampBounds.east);
        expect(clampBounds.south).toBeGreaterThanOrEqual(bbox.latMin);
        expect(clampBounds.north).toBeLessThanOrEqual(bbox.latMax);
        expect(clampBounds.west).toBeGreaterThanOrEqual(bbox.lngMin);
        expect(clampBounds.east).toBeLessThanOrEqual(bbox.lngMax);
    });

    it("rejects a config with a broken field, naming the path", () => {
        const mangled = structuredClone(rawCityConfig) as Record<string, unknown>;
        (mangled.site as Record<string, unknown>).baseUrl = "https://example.com"; // missing trailing slash
        expect(() => validateCityConfig(mangled)).toThrow(/site\.baseUrl/);
    });

    it("rejects a map center outside the clamp bounds", () => {
        const mangled = structuredClone(rawCityConfig) as { map: { center: { lat: number; lng: number } } };
        mangled.map.center = { lat: 0, lng: 0 };
        expect(() => validateCityConfig(mangled)).toThrow(/map\.center/);
    });

    it("rejects duplicate neighborhoods", () => {
        const mangled = structuredClone(rawCityConfig) as { neighborhoods: string[] };
        mangled.neighborhoods = [...mangled.neighborhoods, mangled.neighborhoods[0]];
        expect(() => validateCityConfig(mangled)).toThrow(/neighborhoods/);
    });
});
