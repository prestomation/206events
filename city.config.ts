// City configuration — the single edit surface for running this engine for
// a different city. Every city-specific value the code consumes lives here;
// see docs/city-template.md for the full field reference and what stays
// Seattle-specific until the Phase 2 content strip.
//
// Import rules (enforced by convention, see docs/city-template.md):
//   - Node build code imports the validated `CITY` from lib/config/city.ts.
//   - Web code (and the web-reachable lib/config/tags.ts) imports THIS file
//     directly, so Zod never lands in the browser bundle.
//
// The `satisfies` check below gives immediate editor feedback; full Zod
// validation (including cross-field bounds checks) runs at build startup.
import type { CityConfig } from "./lib/config/city.js";

const cityConfig = {
    city: {
        // Display name, used in web UI copy ("Every Seattle event, one
        // place") and as the Ticketmaster venue-address fallback city.
        name: "Seattle",
        // Two-letter state/region code (Ticketmaster address fallback).
        state: "WA",
        // IANA timezone for the city. Existing source YAMLs declare their
        // own timezone; this is the default for new sources and tooling.
        timezone: "America/Los_Angeles",
    },
    site: {
        // Site/brand name: <title>, PWA manifest, llms.txt, web PRODID.
        name: "206.events",
        // <meta name="description"> for the web UI.
        description:
            "Browse event calendars from Seattle venues, neighborhoods, and organizations. Subscribe via ICS, add events to Google Calendar, or follow RSS feeds for music, art, markets, community events, and more.",
        // Deployed site origin with trailing slash. Used as the base for
        // RSS/sitemap URLs. The SITE_BASE_URL env var still takes precedence.
        baseUrl: "https://206.events/",
        // Deployed site origin without trailing slash, used for the
        // deployed-site manifest probe (new-source detection) and report
        // fetches. The PRODUCTION_URL env var still takes precedence.
        productionUrl: "https://206.events",
        // GitHub owner/repo of this copy — llms.txt source links and the
        // web feedback fallback link.
        repo: "prestomation/206events",
        // Short mark shown in the boot splash and loading screen
        // (Seattle's is its area code).
        bootLogoText: "206",
    },
    ics: {
        // PRODID identifier stamped into every generated ICS file.
        prodId: "206.events",
    },
    geocoder: {
        // Nominatim usage policy requires an identifying User-Agent:
        // https://operations.osmfoundation.org/policies/nominatim/
        nominatimUserAgent: "206.events/1.0 (https://206.events)",
        // Tight box around the metro, sent as `viewbox=…&bounded=1` so
        // ambiguous venue names resolve to the local instance.
        nominatimViewbox: { west: -122.6, south: 47.3, east: -121.9, north: 47.8 },
    },
    map: {
        // Default map view (city center).
        center: { lat: 47.6062, lng: -122.3321 },
        defaultZoom: 12,
        // Populated metro extent used to reject distant outliers from the
        // default map fit. Seattle's box hugs King County: north 47.78 is
        // the King/Snohomish line (keeps Shoreline/Bothell/Kenmore, drops
        // Edmonds/Lynnwood/Everett); south 47.20 keeps Renton/Kent/Auburn/
        // Federal Way/Enumclaw; west -122.42 excludes Tacoma (and Vashon,
        // whose few events still render as markers); east -121.70 keeps
        // Issaquah/North Bend/Snoqualmie, drops the far Cascades/Gorge.
        // Approximate and easily tunable.
        clampBounds: { south: 47.2, west: -122.42, north: 47.78, east: -121.7 },
    },
    // Generous regional bounding box for CI sanity checks on venue
    // coordinates (a venue outside this box is a geocoding bug). Seattle's
    // covers the Pacific Northwest with slop for ferries and day trips.
    venueSanityBbox: { latMin: 45.0, latMax: 49.5, lngMin: -125.5, lngMax: -120.0 },
    // Neighborhood tags — drives TAG_CATEGORIES['Neighborhoods'] in
    // lib/config/tags.ts (website sidebar grouping + neighborhood filters).
    // Grows over time as sources tag new neighborhoods.
    neighborhoods: [
        "Ballard",
        "Beacon Hill",
        "Belltown",
        "Capitol Hill",
        "Central District",
        "Columbia City",
        "Downtown",
        "Eastlake",
        "First Hill",
        "Fremont",
        "Georgetown",
        "Green Lake",
        "Greenwood",
        "International District",
        "Interbay",
        "Kenmore",
        "Lake City",
        "Lake Forest Park",
        "Madison Park",
        "Madrona",
        "Magnolia",
        "Maple Leaf",
        "Phinney",
        "Pike Place",
        "Pioneer Square",
        "QueenAnne",
        "Ravenna",
        "Redmond",
        "Renton",
        "Seward Park",
        "Shoreline",
        "SoDo",
        "South Lake Union",
        "Stadium District",
        "Tukwila",
        "University District",
        "Uptown",
        "Vashon",
        "Wallingford",
        "Wedgwood",
        "West Seattle",
        "White Center",
    ],
    // GoatCounter analytics. Set to null to disable analytics entirely
    // (no snippet is injected into index.html).
    analytics: { goatcounterCode: "seattle-calendars" } as { goatcounterCode: string } | null,
} satisfies CityConfig;

export default cityConfig;
