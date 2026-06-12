import { describe, it, expect } from "vitest";
import { readFile, mkdir, writeFile, mkdtemp, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
    deriveConfig,
    renderCityConfigTs,
    emptyGeocoderTables,
    buildActions,
    renderReadme,
    type CityAnswers,
} from "./init-city.js";
import { validateCityConfig } from "../lib/config/city.js";

const portland: CityAnswers = {
    cityName: "Portland",
    state: "OR",
    timezone: "America/Los_Angeles",
    siteName: "503.events",
    domain: "503.events",
    repo: "alice/503events",
    bootLogoText: "503",
    center: { lat: 45.5152, lng: -122.6784 },
    neighborhoods: ["Pearl District", "Alberta Arts"],
    goatcounterCode: null,
};

describe("deriveConfig", () => {
    it("produces a config that passes the city schema", () => {
        const cfg = deriveConfig(portland);
        expect(() => validateCityConfig(cfg)).not.toThrow();
        expect(cfg.site.baseUrl).toBe("https://503.events/");
        expect(cfg.site.productionUrl).toBe("https://503.events");
        expect(cfg.ics.prodId).toBe("503.events");
        expect(cfg.geocoder.nominatimUserAgent).toBe("503.events/1.0 (https://503.events)");
        expect(cfg.analytics).toBeNull();
    });

    it("derives nested geographic boxes (center ⊂ clamp ⊂ viewbox/sanity)", () => {
        const cfg = deriveConfig(portland);
        const { center, clampBounds } = cfg.map;
        expect(center.lat).toBeGreaterThan(clampBounds.south);
        expect(center.lat).toBeLessThan(clampBounds.north);
        const vb = cfg.geocoder.nominatimViewbox;
        expect(vb.south).toBeLessThan(clampBounds.south);
        expect(vb.north).toBeGreaterThan(clampBounds.north);
        const bbox = cfg.venueSanityBbox;
        expect(bbox.latMin).toBeLessThan(clampBounds.south);
        expect(bbox.latMax).toBeGreaterThan(clampBounds.north);
    });

    it("generates a description when omitted and keeps a provided one", () => {
        expect(deriveConfig(portland).site.description).toContain("Portland");
        const custom = deriveConfig({ ...portland, description: "My custom blurb." });
        expect(custom.site.description).toBe("My custom blurb.");
    });

    it("rejects unusable answers before any destructive action", () => {
        expect(() => deriveConfig({ ...portland, neighborhoods: [] })).toThrow(/neighborhoods/);
        expect(() => deriveConfig({ ...portland, repo: "not-a-repo" })).toThrow(/repo/);
    });
});

describe("renderCityConfigTs", () => {
    it("renders the answers into the config file shape", () => {
        const src = renderCityConfigTs(deriveConfig(portland));
        expect(src).toContain('name: "Portland"');
        expect(src).toContain('"Pearl District",');
        expect(src).toContain("satisfies CityConfig");
        expect(src).toContain("analytics: null as { goatcounterCode: string } | null");
        expect(src).toContain('import type { CityConfig } from "./lib/config/city.js"');
    });

    it("renders a configured analytics code", () => {
        const src = renderCityConfigTs(deriveConfig({ ...portland, goatcounterCode: "pdx-cal" }));
        expect(src).toContain('analytics: { goatcounterCode: "pdx-cal" }');
    });
});

const TABLE_NAMES = [
    "SEATTLE_NEIGHBORHOOD_CENTROIDS",
    "SPL_BRANCH_COORDS",
    "UW_BUILDING_COORDS",
    "UW_NAMED_LOCATIONS",
    "KNOWN_VENUE_COORDS",
];

describe("emptyGeocoderTables", () => {
    it("empties populated tables and is idempotent", () => {
        const src = TABLE_NAMES.map(name =>
            `const ${name}: Record<string, GeoCoords> = {\n  'somewhere': { lat: 1, lng: 2 },\n};`,
        ).join("\n\n");
        const out = emptyGeocoderTables(src);
        for (const name of TABLE_NAMES) {
            expect(out).toContain(`const ${name}: Record<string, GeoCoords> = {\n};`);
        }
        expect(out).not.toContain("'somewhere'");
        // Idempotent: emptying twice converges
        expect(emptyGeocoderTables(out)).toBe(out);
    });

    it("still locates every table in the real lib/geocoder.ts", async () => {
        // Whether the tables are populated (reference instance) or already
        // emptied (template copy), the regexes must keep matching so a
        // re-run never throws.
        const src = await readFile("lib/geocoder.ts", "utf8");
        expect(() => emptyGeocoderTables(src)).not.toThrow();
    });

    it("throws when a table can no longer be found", () => {
        expect(() => emptyGeocoderTables("nothing here")).toThrow(/could not locate/);
    });
});

describe("buildActions", () => {
    /** Synthetic repo layout so the test is independent of whether the
     *  Seattle content still exists in this checkout. */
    async function makeFixtureRoot(): Promise<string> {
        const root = await mkdtemp(join(tmpdir(), "init-city-test-"));
        await mkdir(join(root, "sources", "some_venue"), { recursive: true });
        await writeFile(join(root, "sources", "some_venue", "ripper.yaml"), "name: some-venue\n");
        await mkdir(join(root, "sources", "external"), { recursive: true });
        await writeFile(join(root, "sources", "external", "feed.yaml"), "name: feed\n");
        await mkdir(join(root, "sources", "recurring"), { recursive: true });
        await writeFile(join(root, "sources", "recurring", "market.yaml"), "name: market\n");
        await mkdir(join(root, "docs", "source-candidates"), { recursive: true });
        await writeFile(join(root, "docs", "source-candidates", "README.md"), "# schema\n");
        await writeFile(join(root, "docs", "source-candidates", "a-venue.md"), "notes\n");
        await mkdir(join(root, "docs", "discovery-log"), { recursive: true });
        await writeFile(join(root, "docs", "discovery-log", "README.md"), "# format\n");
        await writeFile(join(root, "docs", "discovery-log", "2026-01-01.md"), "log\n");
        await mkdir(join(root, "allowed-removals"), { recursive: true });
        await writeFile(join(root, "allowed-removals", "old.ics"), "");
        await mkdir(join(root, ".github", "workflows"), { recursive: true });
        await writeFile(join(root, ".github", "workflows", "notify-discord.yml"), "name: Discord Notifications\n");
        return root;
    }

    it("plans the strip from the repo layout", async () => {
        const root = await makeFixtureRoot();
        const actions = await buildActions(root, deriveConfig(portland));
        const descs = actions.map(a => a.description);
        expect(descs).toContain("write city.config.ts (regenerated from answers)");
        expect(descs).toContain("delete sources/some_venue/");
        expect(descs).toContain("delete sources/external/feed.yaml");
        expect(descs).toContain("delete sources/recurring/market.yaml");
        expect(descs).toContain("delete docs/source-candidates/a-venue.md");
        expect(descs).toContain("delete allowed-removals/old.ics");
        expect(descs).toContain("delete .github/workflows/notify-discord.yml");
        expect(descs).toContain("reset event-uncertainty-cache.json to the empty baseline");
        expect(descs).toContain("empty the Seattle lookup tables in lib/geocoder.ts");
        // The external/ and recurring/ dirs themselves are never deleted,
        // and the READMEs survive.
        expect(descs.some(d => d === "delete sources/external/" || d === "delete sources/recurring/")).toBe(false);
        expect(descs.some(d => d.startsWith("delete ") && d.includes("README.md"))).toBe(false);
    });

    it("applies the file deletions and keeps the kept files", async () => {
        const root = await makeFixtureRoot();
        // lib/geocoder.ts and the rewrite targets aren't in the fixture —
        // apply only the deletion/keep actions, which is what the fixture
        // exercises.
        const actions = (await buildActions(root, deriveConfig(portland)))
            .filter(a => a.description.startsWith("delete ") || a.description.startsWith("keep "));
        for (const a of actions) await a.apply();
        expect(await readdir(join(root, "sources"))).toEqual(["external", "recurring"]);
        expect(await readdir(join(root, "sources", "external"))).toEqual([".gitkeep"]);
        expect(await readdir(join(root, "docs", "source-candidates"))).toEqual(["README.md"]);
        expect(await readdir(join(root, "allowed-removals"))).toEqual([".gitkeep"]);
        expect(await readdir(join(root, ".github", "workflows"))).toEqual([]);
    });
});

describe("renderReadme", () => {
    it("brands the README for the new city", () => {
        const md = renderReadme(deriveConfig(portland));
        expect(md).toContain("# 503.events");
        expect(md).toContain("Portland-area");
        expect(md).toContain("alice/503events");
    });

    it("points the operator at the setup docs and routine catalog", () => {
        const md = renderReadme(deriveConfig(portland));
        expect(md).toContain("docs/SETUP.md");
        expect(md).toContain("docs/routines.md");
    });
});
