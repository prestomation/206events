/**
 * init-city — turn a fresh copy of this template into a new city's instance.
 *
 * Regenerates city.config.ts from your answers, rewrites the files that can't
 * import the config (web/src/sw.js, README.md), and strips the Seattle
 * content (sources, candidate docs, discovery logs, caches, geocoder lookup
 * tables). Deterministic and idempotent — safe to re-run. See
 * docs/city-template.md for the full design.
 *
 * Usage:
 *   npm run init-city                       # interactive prompts
 *   npm run init-city -- --answers city.json --yes
 *   npm run init-city -- --answers city.json --dry-run
 *
 * Answers JSON shape (see promptAnswers() for defaults):
 *   {
 *     "cityName": "Portland", "state": "OR", "timezone": "America/Los_Angeles",
 *     "siteName": "503.events", "domain": "503.events",
 *     "repo": "alice/503events", "bootLogoText": "503",
 *     "description": "(optional — generated from cityName when omitted)",
 *     "center": { "lat": 45.5152, "lng": -122.6784 },
 *     "defaultZoom": 12,
 *     "neighborhoods": ["Pearl District", "Alberta Arts"],
 *     "goatcounterCode": null
 *   }
 *
 * Flags:
 *   --answers <file>  Read answers from JSON instead of prompting
 *   --dry-run         Print every planned action without touching anything
 *   --yes             Skip the confirmation prompt before the content strip
 */

import { readFile, writeFile, readdir, rm, stat } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { validateCityConfig, type CityConfig } from "../lib/config/city.js";

// ---------------------------------------------------------------------------
// Answers → config derivation
// ---------------------------------------------------------------------------

export interface CityAnswers {
    cityName: string;
    state: string;
    timezone: string;
    siteName: string;
    /** Bare domain, e.g. "503.events" — baseUrl/productionUrl are derived. */
    domain: string;
    /** owner/repo of the template copy. */
    repo: string;
    bootLogoText: string;
    description?: string;
    center: { lat: number; lng: number };
    defaultZoom?: number;
    neighborhoods: string[];
    goatcounterCode?: string | null;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Derive a full CityConfig from the answers. The geographic boxes are
 * generous defaults centered on the city — clamp bounds roughly frame a
 * metro area, the Nominatim viewbox adds a margin, and the sanity bbox
 * covers the wider region. All are meant to be hand-tuned in
 * city.config.ts afterwards; the schema's nesting invariants
 * (center ⊂ clampBounds ⊂ venueSanityBbox) hold by construction.
 */
export function deriveConfig(answers: CityAnswers): CityConfig {
    const { lat, lng } = answers.center;
    const clampBounds = {
        south: round(lat - 0.29),
        west: round(lng - 0.36),
        north: round(lat + 0.29),
        east: round(lng + 0.36),
    };
    const nominatimViewbox = {
        south: round(clampBounds.south - 0.15),
        west: round(clampBounds.west - 0.15),
        north: round(clampBounds.north + 0.15),
        east: round(clampBounds.east + 0.15),
    };
    const venueSanityBbox = {
        latMin: round(lat - 2.25),
        latMax: round(lat + 2.25),
        lngMin: round(lng - 2.75),
        lngMax: round(lng + 2.75),
    };
    const description =
        answers.description?.trim() ||
        `Browse event calendars from ${answers.cityName} venues, neighborhoods, and organizations. ` +
        `Subscribe via ICS, add events to Google Calendar, or follow RSS feeds for music, art, markets, community events, and more.`;
    return validateCityConfig({
        city: {
            name: answers.cityName,
            state: answers.state,
            timezone: answers.timezone,
        },
        site: {
            name: answers.siteName,
            description,
            baseUrl: `https://${answers.domain}/`,
            productionUrl: `https://${answers.domain}`,
            repo: answers.repo,
            bootLogoText: answers.bootLogoText,
        },
        ics: { prodId: answers.siteName },
        geocoder: {
            nominatimUserAgent: `${answers.siteName}/1.0 (https://${answers.domain})`,
            nominatimViewbox,
        },
        map: {
            center: { lat, lng },
            defaultZoom: answers.defaultZoom ?? 12,
            clampBounds,
        },
        venueSanityBbox,
        neighborhoods: answers.neighborhoods,
        analytics: answers.goatcounterCode ? { goatcounterCode: answers.goatcounterCode } : null,
    });
}

// ---------------------------------------------------------------------------
// city.config.ts rendering (whole-file generation, never patching)
// ---------------------------------------------------------------------------

const q = (s: string) => JSON.stringify(s);

export function renderCityConfigTs(cfg: CityConfig): string {
    const hoods = cfg.neighborhoods.map(n => `        ${q(n)},`).join("\n");
    const analytics = cfg.analytics
        ? `{ goatcounterCode: ${q(cfg.analytics.goatcounterCode)} } as { goatcounterCode: string } | null`
        : `null as { goatcounterCode: string } | null`;
    return `// City configuration — the single edit surface for running this engine for
// a different city. Every city-specific value the code consumes lives here;
// see docs/city-template.md for the full field reference.
//
// Generated by \`npm run init-city\`. Edit freely — the geographic boxes in
// particular are derived defaults worth hand-tuning to your metro's shape.
//
// Import rules (enforced by convention, see docs/city-template.md):
//   - Node build code imports the validated \`CITY\` from lib/config/city.ts.
//   - Web code (and the web-reachable lib/config/tags.ts) imports THIS file
//     directly, so Zod never lands in the browser bundle.
//
// The \`satisfies\` check below gives immediate editor feedback; full Zod
// validation (including cross-field bounds checks) runs at build startup.
import type { CityConfig } from "./lib/config/city.js";

const cityConfig = {
    city: {
        // Display name, used in web UI copy and as the Ticketmaster
        // venue-address fallback city.
        name: ${q(cfg.city.name)},
        // Two-letter state/region code (Ticketmaster address fallback).
        state: ${q(cfg.city.state)},
        // IANA timezone for the city — the default for new sources.
        timezone: ${q(cfg.city.timezone)},
    },
    site: {
        // Site/brand name: <title>, PWA manifest, llms.txt, web PRODID.
        name: ${q(cfg.site.name)},
        // <meta name="description"> for the web UI.
        description:
            ${q(cfg.site.description)},
        // Deployed site origin with trailing slash. Used as the base for
        // RSS/sitemap URLs. The SITE_BASE_URL env var still takes precedence.
        baseUrl: ${q(cfg.site.baseUrl)},
        // Deployed site origin without trailing slash, used for the
        // deployed-site manifest probe (new-source detection) and report
        // fetches. The PRODUCTION_URL env var still takes precedence.
        productionUrl: ${q(cfg.site.productionUrl)},
        // GitHub owner/repo of this copy — llms.txt source links and the
        // web feedback fallback link.
        repo: ${q(cfg.site.repo)},
        // Short mark shown in the boot splash and loading screen.
        bootLogoText: ${q(cfg.site.bootLogoText)},
    },
    ics: {
        // PRODID identifier stamped into every generated ICS file.
        prodId: ${q(cfg.ics.prodId)},
    },
    geocoder: {
        // Nominatim usage policy requires an identifying User-Agent:
        // https://operations.osmfoundation.org/policies/nominatim/
        nominatimUserAgent: ${q(cfg.geocoder.nominatimUserAgent)},
        // Tight box around the metro, sent as \`viewbox=…&bounded=1\` so
        // ambiguous venue names resolve to the local instance.
        nominatimViewbox: { west: ${cfg.geocoder.nominatimViewbox.west}, south: ${cfg.geocoder.nominatimViewbox.south}, east: ${cfg.geocoder.nominatimViewbox.east}, north: ${cfg.geocoder.nominatimViewbox.north} },
    },
    map: {
        // Default map view (city center).
        center: { lat: ${cfg.map.center.lat}, lng: ${cfg.map.center.lng} },
        defaultZoom: ${cfg.map.defaultZoom},
        // Populated metro extent used to reject distant outliers from the
        // default map fit. Derived from the city center — tune to your
        // metro/county shape.
        clampBounds: { south: ${cfg.map.clampBounds.south}, west: ${cfg.map.clampBounds.west}, north: ${cfg.map.clampBounds.north}, east: ${cfg.map.clampBounds.east} },
    },
    // Generous regional bounding box for CI sanity checks on venue
    // coordinates (a venue outside this box is a geocoding bug).
    venueSanityBbox: { latMin: ${cfg.venueSanityBbox.latMin}, latMax: ${cfg.venueSanityBbox.latMax}, lngMin: ${cfg.venueSanityBbox.lngMin}, lngMax: ${cfg.venueSanityBbox.lngMax} },
    // Neighborhood tags — drives TAG_CATEGORIES['Neighborhoods'] in
    // lib/config/tags.ts (website sidebar grouping + neighborhood filters).
    // Grows over time as sources tag new neighborhoods.
    neighborhoods: [
${hoods}
    ],
    // GoatCounter analytics. Set to null to disable analytics entirely
    // (no snippet is injected into index.html).
    analytics: ${analytics},
} satisfies CityConfig;

export default cityConfig;
`;
}

// ---------------------------------------------------------------------------
// Seattle content strip
// ---------------------------------------------------------------------------

/**
 * Empty the Seattle lookup tables in lib/geocoder.ts (neighborhood
 * centroids, SPL branches, UW buildings, KNOWN_VENUE_COORDS). The matching
 * logic around them is table-driven, so empty tables are clean no-ops; a
 * new city regrows KNOWN_VENUE_COORDS via the geo-resolver skill.
 */
export function emptyGeocoderTables(src: string): string {
    const tables = [
        "SEATTLE_NEIGHBORHOOD_CENTROIDS",
        "SPL_BRANCH_COORDS",
        "UW_BUILDING_COORDS",
        "UW_NAMED_LOCATIONS",
        "KNOWN_VENUE_COORDS",
    ];
    let out = src;
    for (const name of tables) {
        const re = new RegExp(
            `(const ${name}: Record<string, GeoCoords> = \\{)[\\s\\S]*?(^\\};)`,
            "m",
        );
        if (!re.test(out)) {
            throw new Error(`init-city: could not locate table ${name} in lib/geocoder.ts — has it been renamed?`);
        }
        out = out.replace(re, `$1\n$2`);
    }
    return out;
}

export function renderReadme(cfg: CityConfig): string {
    return `# ${cfg.site.name}

Subscribe to ${cfg.city.name}-area event calendars in your favorite calendar
app. This project scrapes event data from local websites, ICS feeds, and
APIs, then publishes them as standard iCalendar (.ics) files you can add to
Google Calendar, Apple Calendar, Outlook, or any other calendar application.

**${cfg.site.baseUrl}**

Built from the [206.events city template](https://github.com/prestomation/206events)
— see \`docs/SETUP.md\` for the full setup walkthrough, \`docs/city-template.md\`
for how this instance is configured, and \`AGENTS.md\` for the agent-driven
maintenance workflow.

## Getting started

1. **Deploy**: edit \`city.config.ts\` if any value needs tuning (map bounds
   especially), set up the Cloudflare Pages project and GitHub secrets
   (\`docs/SETUP.md\` steps 4–5), and add your first sources —
   \`skills/source-discovery/SKILL.md\`.
2. **Self-maintain**: create the four Claude Code routines catalogued in
   \`docs/routines.md\` (build-error responder, daily source discovery,
   daily source implementation, GitHub-issues responder).
3. **Optional services**: Discord notifications, out-of-band proxy,
   favorites/sign-in — \`docs/SETUP.md\` step 7.

## Request a new calendar

Want a ${cfg.city.name}-area event source added? Open an issue at
https://github.com/${cfg.site.repo}/issues with the website URL.
`;
}

export function renderIdeasMd(cfg: CityConfig): string {
    return `# ${cfg.site.name} Feature Ideas

Non-source feature ideas and improvements for ${cfg.site.name}. Source
candidates live in \`docs/source-candidates/\` (one file per candidate).
`;
}

interface StripAction {
    description: string;
    apply: () => Promise<void>;
}

async function listDir(path: string): Promise<string[]> {
    try {
        return await readdir(path);
    } catch {
        return [];
    }
}

/**
 * Build the full list of strip/rewrite actions. Everything is idempotent:
 * deleting already-deleted content is a no-op, rewrites converge.
 */
export async function buildActions(root: string, cfg: CityConfig): Promise<StripAction[]> {
    const actions: StripAction[] = [];
    const add = (description: string, apply: () => Promise<void>) =>
        actions.push({ description, apply });

    // 1. city.config.ts — whole-file regeneration
    add("write city.config.ts (regenerated from answers)", async () => {
        await writeFile(join(root, "city.config.ts"), renderCityConfigTs(cfg));
    });

    // 2. Ripper source directories (everything except external/ and recurring/)
    const sourceDirs = (await listDir(join(root, "sources"))).filter(
        d => d !== "external" && d !== "recurring",
    );
    for (const dir of sourceDirs) {
        add(`delete sources/${dir}/`, () => rm(join(root, "sources", dir), { recursive: true, force: true }));
    }

    // 3. External + recurring YAMLs (keep the dirs via .gitkeep)
    for (const sub of ["external", "recurring"]) {
        const files = (await listDir(join(root, "sources", sub))).filter(f => f !== ".gitkeep");
        for (const f of files) {
            add(`delete sources/${sub}/${f}`, () => rm(join(root, "sources", sub, f), { force: true }));
        }
        add(`keep sources/${sub}/ via .gitkeep`, () => writeFile(join(root, "sources", sub, ".gitkeep"), ""));
    }

    // 4. Source-candidate docs and discovery log (keep each README.md)
    for (const sub of ["docs/source-candidates", "docs/discovery-log"]) {
        const files = (await listDir(join(root, sub))).filter(f => f !== "README.md");
        for (const f of files) {
            add(`delete ${sub}/${f}`, () => rm(join(root, sub, f), { force: true, recursive: true }));
        }
    }
    add("delete legacy docs/source-candidates.md (if present)", () =>
        rm(join(root, "docs", "source-candidates.md"), { force: true }));

    // 5. allowed-removals/ markers (keep the dir via .gitkeep)
    const removals = (await listDir(join(root, "allowed-removals"))).filter(f => f !== ".gitkeep");
    for (const f of removals) {
        add(`delete allowed-removals/${f}`, () => rm(join(root, "allowed-removals", f), { force: true }));
    }
    add("keep allowed-removals/ via .gitkeep", () =>
        writeFile(join(root, "allowed-removals", ".gitkeep"), ""));

    // 6. Caches: uncertainty cache resets to the empty baseline; the
    // out-of-band report is Seattle data and the build tolerates its absence.
    add("reset event-uncertainty-cache.json to the empty baseline", () =>
        writeFile(join(root, "event-uncertainty-cache.json"), JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n"));
    add("delete outofband-report.json", () =>
        rm(join(root, "outofband-report.json"), { force: true }));

    // 7. Discord notification workflow — reference-instance specific (hardcoded
    // role mention, 206events defaults). The workflow is self-contained (its
    // workflow_run triggers live inside it), so deleting it breaks nothing.
    // Copies that want Discord restore it from upstream and set
    // DISCORD_WEBHOOK_CALENDAR (see docs/SETUP.md).
    add("delete .github/workflows/notify-discord.yml", () =>
        rm(join(root, ".github", "workflows", "notify-discord.yml"), { force: true }));

    // 8. Geocoder Seattle lookup tables → empty stubs
    add("empty the Seattle lookup tables in lib/geocoder.ts", async () => {
        const path = join(root, "lib", "geocoder.ts");
        await writeFile(path, emptyGeocoderTables(await readFile(path, "utf8")));
    });

    // 9. Files that cannot import the config: sw.js brand strings, README, ideas.md
    add("rebrand web/src/sw.js", async () => {
        const path = join(root, "web", "src", "sw.js");
        const sw = await readFile(path, "utf8");
        await writeFile(path, sw.replaceAll("206.events", cfg.site.name));
    });
    add("write README.md (generated for the new city)", () =>
        writeFile(join(root, "README.md"), renderReadme(cfg)));
    add("write ideas.md (reset to header)", () =>
        writeFile(join(root, "ideas.md"), renderIdeasMd(cfg)));

    return actions;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function promptAnswers(): Promise<CityAnswers> {
    const rl = createInterface({ input, output });
    const ask = async (label: string, fallback?: string): Promise<string> => {
        const suffix = fallback !== undefined ? ` [${fallback}]` : "";
        const raw = (await rl.question(`${label}${suffix}: `)).trim();
        if (raw) return raw;
        if (fallback !== undefined) return fallback;
        console.log("  (required)");
        return ask(label, fallback);
    };
    try {
        const cityName = await ask("City name (e.g. Portland)");
        const state = await ask("State/region code (e.g. OR)");
        const timezone = await ask("IANA timezone", "America/Los_Angeles");
        const domain = await ask("Site domain (e.g. 503.events)");
        const siteName = await ask("Site name", domain);
        const repo = await ask("GitHub repo (owner/name)");
        const bootLogoText = await ask("Boot logo text (short mark, e.g. area code)", siteName.split(".")[0]);
        const lat = Number(await ask("City center latitude"));
        const lng = Number(await ask("City center longitude"));
        const hoods = await ask("Neighborhood tags (comma-separated)", "Downtown");
        const goat = await ask("GoatCounter code (empty to disable analytics)", "");
        return {
            cityName, state, timezone, siteName, domain, repo, bootLogoText,
            center: { lat, lng },
            neighborhoods: hoods.split(",").map(s => s.trim()).filter(Boolean),
            goatcounterCode: goat || null,
        };
    } finally {
        rl.close();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const yes = args.includes("--yes");
    const answersIdx = args.indexOf("--answers");

    // Guard: must run from the repo root.
    try {
        const pkg = JSON.parse(await readFile("package.json", "utf8"));
        if (pkg.name !== "icalendar-ripper") throw new Error("wrong package");
        await stat("sources");
    } catch {
        console.error("init-city must run from the repository root (package.json + sources/ not found).");
        process.exit(1);
    }

    const answers: CityAnswers = answersIdx >= 0
        ? JSON.parse(await readFile(args[answersIdx + 1], "utf8"))
        : await promptAnswers();

    // Validates via the Zod schema — bad answers fail here, before any
    // destructive action.
    const cfg = deriveConfig(answers);

    const actions = await buildActions(process.cwd(), cfg);
    console.log(`\ninit-city will configure "${cfg.site.name}" (${cfg.city.name}, ${cfg.city.state}) and apply ${actions.length} action(s):\n`);
    for (const a of actions) console.log(`  - ${a.description}`);

    if (dryRun) {
        console.log("\n--dry-run: nothing was changed.");
        return;
    }
    if (!yes) {
        const rl = createInterface({ input, output });
        const confirm = (await rl.question("\nThis permanently deletes the Seattle content. Continue? (yes/no): ")).trim().toLowerCase();
        rl.close();
        if (confirm !== "yes" && confirm !== "y") {
            console.log("Aborted — nothing was changed.");
            return;
        }
    }

    for (const a of actions) {
        await a.apply();
    }
    console.log(`\nDone. Next steps:
  1. Review the diff, especially city.config.ts (tune the derived map bounds).
  2. npm run typecheck && npm run test:all
  3. Follow docs/SETUP.md — or run skills/city-setup/SKILL.md in Claude Code
     — for secrets, Cloudflare Pages, and your first sources.
  4. To make the site self-maintaining, create the Claude Code routines
     catalogued in docs/routines.md.`);
}

// Only run the CLI when executed directly (not when imported by tests).
const invokedDirectly = process.argv[1]?.endsWith("init-city.ts");
if (invokedDirectly) {
    main().catch(err => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
