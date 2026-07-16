import { readFile, writeFile } from 'fs/promises';
import type { GeocodeError } from './config/schema.js';
import { CITY } from './config/city.js';

export type OsmType = 'node' | 'way' | 'relation';

export interface GeoCoords {
  lat: number;
  lng: number;
  osmId?: number;
  osmType?: OsmType;
}

export interface GeoCacheEntry {
  lat?: number;
  lng?: number;
  osmId?: number;
  osmType?: OsmType;
  unresolvable?: boolean;
  geocodedAt: string;
  source: 'nominatim' | 'manual';
  firstSeen?: string;
}

export interface GeoCache {
  version: number;
  entries: Record<string, GeoCacheEntry>;
}

/**
 * Check if a location string represents a vague/unresolvable location
 * like "Offsite" or "TBA" that should not be sent to Nominatim.
 */
export function isVagueLocation(location: string): boolean {
  const lower = location.toLowerCase().trim();
  // Match vague location patterns that won't geocode meaningfully
  const vaguePatterns = [
    /^offsite\b/i,             // "Offsite, Bellevue, WA" etc
    /^tba\b/i,                 // "TBA", "TBA - location TBD"
    /^tbd\b/i,                 // "TBD"
    /^various locations?\b/i,   // "Various locations"
    /^multiple locations?\b/i, // "Multiple locations"
    /^to be announced\b/i,      // "To be announced"
    /^to be determined\b/i,    // "To be determined"
    /^coming soon\b/i,         // "Coming soon"
    /^check back\b/i,          // "Check back for location"
    /^zoom\b/i,                // Zoom meetings
    /^virtual\b/i,             // Virtual events
    /^online\b/i,              // Online events
    /^webinar\b/i,             // Webinars
  ];
  return vaguePatterns.some(pattern => pattern.test(lower));
}

/**
 * Normalize a raw location string from an ICS feed or scraper:
 * 1. Unescape ICS-escaped commas (\\, → ,)
 * 2. Strip HTML tags
 * 3. Split on <br>, newlines, or semicolons and take only the first segment
 *    OR intelligently extract address from HTML-bridge format (venue<br>address)
 * 4. Collapse internal whitespace and trim
 */
export function normalizeLocation(location: string): string {
  // Step 1: Unescape ICS-escaped commas (\\, → ,)
  let normalized = location.replace(/\\,/g, ',');

  // Step 2: Check for HTML <br> format with venue on first line and address on second
  // e.g. "A Resting Place<br>670 S. King St.<br>Seattle, WA 98104"
  // We want to extract the address line (starts with a digit)
  const brSegments = normalized.split(/<br\s*\/?>/i);
  if (brSegments.length >= 2) {
    // Look for a segment that starts with a digit (likely an address)
    const addressSegment = brSegments.find(seg => /^\s*\d/.test(seg));
    if (addressSegment) {
      // Use the address segment (strip any trailing <br> content)
      normalized = addressSegment.split(/<br\s*\/?>/i)[0];
    } else {
      // No address found, fall back to first segment
      normalized = brSegments[0];
    }
  }

  // Step 3: Strip all remaining HTML tags (closed tags like <a href="...">)
  const stripped = normalized.replace(/<[^>]*>/g, '');

  // Step 3b: Strip unclosed/malformed HTML tags (e.g. truncated "<a href=..." without closing >)
  const noUnclosedTags = stripped.replace(/<[^>]*$/, '').trim();

  // Step 4: Split on newlines and semicolons, take the first non-empty part
  const lines = noUnclosedTags.split(/[\n\r;]+/);
  const firstLine = lines.find(l => l.trim().length > 0) ?? noUnclosedTags;

  // Step 5: Collapse internal whitespace and trim
  const result = firstLine.replace(/\s+/g, ' ').trim();

  // Step 6: If the result is just a label like "Meeting:" with no address, treat as empty
  if (/^meeting:\s*$/i.test(result)) {
    return '';
  }

  return result;
}

export function normalizeLocationKey(location: string): string {
  return normalizeLocation(location).toLowerCase();
}

/**
 * If the location looks like "Venue Name: 1234 Street..." or "Venue Name, 1234 Street..."
 * (i.e. a venue prefix followed by a street address starting with a digit),
 * return the address-only portion.  Returns null if no venue prefix is detected.
 *
 * Only `:` or `,` are treated as venue-prefix separators; plain spaces are not,
 * to avoid false positives on bare addresses like "1515 12th Ave, Seattle WA".
 */
export function extractAddressFromVenuePrefix(location: string): string | null {
  // Match "Some Venue Name: 1234 Street..." or "Some Venue Name, 1234 Street..."
  // The venue part must contain at least one non-digit character (so pure addresses
  // like "1515 12th Ave" don't accidentally match).
  const match = location.match(/^([^:,]*[A-Za-z][^:,]*)[:,]\s*(\d.+)$/);
  if (match) {
    return match[2].trim();
  }
  return null;
}

/**
 * If the location string is a Google Maps search URL of the form:
 *   https://www.google.com/maps/search/?api=1&query=<url-encoded-address>
 * extract and return the decoded query parameter as the location string.
 * Also handles Google Maps short URLs (maps.app.goo.gl) by attempting to resolve them.
 * Returns null if not a Google Maps search URL.
 */
export async function extractFromGoogleMapsUrl(location: string): Promise<string | null> {
  const trimmed = location.trim();
  
  // Handle Google Maps short URLs (maps.app.goo.gl)
  // These URLs redirect to the actual Google Maps URL
  const shortUrlMatch = trimmed.match(/^https?:\/\/maps\.app\.goo\.gl\/\S+/i);
  if (shortUrlMatch) {
    // Short URLs can't be resolved synchronously - return null
    // The geocoder will mark these as unresolvable
    return null;
  }
  
  // Match Google Maps search URLs
  const match = trimmed.match(/^https?:\/\/(?:www\.)?google\.com\/maps\/search\/\?/i);
  if (!match) return null;

  try {
    const url = new URL(trimmed);
    const query = url.searchParams.get('query');
    if (query != null && query.trim().length > 0) {
      return query.trim();
    }
    return null;
  } catch {
    // If URL parsing fails, try regex fallback
    const queryMatch = trimmed.match(/[?&]query=([^&]+)/i);
    if (queryMatch != null && queryMatch[1] != null) {
      try {
        const decoded = decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')).trim();
        return decoded.length > 0 ? decoded : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Strip suite/floor/room/level suffixes from a location string that may cause
 * Nominatim lookup failures. Also collapses double commas and strips trailing
 * ", United States" or ", USA".
 *
 * Returns the stripped string, or null if no stripping was done (i.e. the
 * string is the same as the input after stripping).
 */
export function stripSuiteFloorSuffixes(location: string): string | null {
  let result = location;

  // Strip sub-room qualifiers FIRST (before individual suite/floor/room/level strippers)
  // to avoid compound patterns being partially matched by the generic strippers.
  // Match both ", " and " - " separators, and handle optional room numbers /
  // multilingual suffixes after " / ".
  // e.g. "Capitol Hill Branch, Meeting Room" → "Capitol Hill Branch"
  // e.g. "Library, Meeting Room 1 / 会议室" → "Library"
  // e.g. "Community Center - Meeting Room / Sala de reuniones" → "Community Center"
  // "Level N - Room N" patterns (e.g. ", Level 2 - Room 201")
  result = result.replace(/[,\s]*,\s*level\s+[\w-]+\s*[-–]\s*room\s+[\w-]+(\s*\/.*)?$/i, '');
  result = result.replace(/[,\s]*[-–]\s*meeting room(\s+[\w-]+)?(\s*\/.*)?$/i, '');
  result = result.replace(/[,\s]*,\s*meeting room(\s+[\w-]+)?(\s*\/.*)?$/i, '');
  result = result.replace(/[,\s]*,\s*children'?s?\s+area(\s*\/.*)?$/i, '');
  result = result.replace(/[,\s]*,\s*lobby(\s*\/.*)?$/i, '');
  // Strip any trailing " / <multilingual text>" that looks like a translation duplicate
  // but only when it appears after a sub-room keyword has already been stripped above,
  // or standalone at the very end of a string after a known room-like prefix.
  // (Standalone " / X" is NOT stripped to avoid false positives on "Venue A / Venue B")

  // Strip #NNN (including alphanumeric and hyphenated suite numbers like #100A, #3-B)
  // Suite NNN, Ste NNN, Floor N, Flr N, Room NNN, Level N
  // These may appear anywhere in the string (with a preceding comma/space separator)
  // Use [\w-]+ to match suite numbers with hyphens (e.g. Suite 200-A)
  result = result.replace(/[,\s]*#\s*[\w-]+/g, '');
  result = result.replace(/[,\s]*\bSuite\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bSte\.?\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bUnit\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bFloor\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bFlr\.?\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bRoom\s+[\w-]+/gi, '');
  result = result.replace(/[,\s]*\bLevel\s+[\w-]+/gi, '');

  // Collapse double commas
  result = result.replace(/,\s*,+/g, ',');

  // Strip trailing ", United States" or ", USA"
  result = result.replace(/,\s*United States\s*$/i, '');
  result = result.replace(/,\s*USA\s*$/i, '');

  // Trim
  result = result.trim().replace(/,\s*$/, '').trim();

  if (result === location || result === '') return null;
  return result;
}

// ---------------------------------------------------------------------------
// Seattle reference content. The lookup tables below (neighborhood centroids,
// SPL branches, UW buildings, KNOWN_VENUE_COORDS) are city CONTENT, not engine
// logic: their keys never match locations from another city, so they are
// harmless for template copies and are stripped/regrown by the Phase 2
// init-city script. See docs/city-template.md.
// ---------------------------------------------------------------------------

/**
 * Seattle neighborhood centroid table. Used as a fallback when Nominatim
 * fails for neighborhood-level location strings.
 */
const SEATTLE_NEIGHBORHOOD_CENTROIDS: Record<string, GeoCoords> = {
  'belltown': { lat: 47.6132, lng: -122.3473 },
  'capitol hill': { lat: 47.6253, lng: -122.3222 },
  'central district': { lat: 47.6097, lng: -122.2953 },
  'fremont': { lat: 47.6512, lng: -122.3501 },
  'georgetown': { lat: 47.5477, lng: -122.3226 },
  'magnolia': { lat: 47.6431, lng: -122.4009 },
  'wallingford': { lat: 47.6603, lng: -122.3338 },
  'phinney ridge': { lat: 47.6699, lng: -122.3551 },
  'greenwood': { lat: 47.6920, lng: -122.3551 },
  'ballard': { lat: 47.6677, lng: -122.3829 },
  'south lake union': { lat: 47.6275, lng: -122.3362 },
  'seattle center': { lat: 47.6205, lng: -122.3493 },
  'pioneer square': { lat: 47.6007, lng: -122.3321 },
  'international district': { lat: 47.5983, lng: -122.3237 },
  'beacon hill': { lat: 47.5674, lng: -122.3076 },
  'columbia city': { lat: 47.5596, lng: -122.2893 },
  'rainier valley': { lat: 47.5468, lng: -122.2754 },
  'west seattle': { lat: 47.5629, lng: -122.3862 },
  'university district': { lat: 47.6614, lng: -122.3121 },
  'queen anne': { lat: 47.6374, lng: -122.3569 },
  'eastlake': { lat: 47.6392, lng: -122.3252 },
  'lake city': { lat: 47.7190, lng: -122.2976 },
};

/**
 * Look up Seattle neighborhood centroid coords from a normalized location string.
 * Matches "<neighborhood> neighborhood, seattle" or "<neighborhood>, seattle"
 * (case-insensitive). Returns null if no match.
 */
export function lookupNeighborhoodCentroid(location: string): GeoCoords | null {
  const lower = location.toLowerCase().trim();

  for (const [neighborhood, coords] of Object.entries(SEATTLE_NEIGHBORHOOD_CENTROIDS)) {
    // Match "<neighborhood> neighborhood, seattle" or "<neighborhood>, seattle"
    // or just "<neighborhood>" alone
    if (
      lower === neighborhood ||
      lower === `${neighborhood} neighborhood, seattle` ||
      lower === `${neighborhood}, seattle` ||
      lower === `${neighborhood} neighborhood, seattle, wa` ||
      lower === `${neighborhood}, seattle, wa`
    ) {
      return coords;
    }
  }

  return null;
}

/**
 * Seattle Public Library branch coordinates.
 */
const SPL_BRANCH_COORDS: Record<string, GeoCoords> = {
  'ballard branch': { lat: 47.6671, lng: -122.3836 },
  'beacon hill branch': { lat: 47.5689, lng: -122.3014 },
  'broadview branch': { lat: 47.7377, lng: -122.3560 },
  'capitol hill branch': { lat: 47.6234, lng: -122.3196 },
  'central library': { lat: 47.6064, lng: -122.3328 },
  'columbia branch': { lat: 47.5589, lng: -122.2917 },
  'delridge branch': { lat: 47.5540, lng: -122.3620 },
  'douglass-truth branch': { lat: 47.6097, lng: -122.3000 },
  'fremont branch': { lat: 47.6519, lng: -122.3502 },
  'green lake branch': { lat: 47.6788, lng: -122.3321 },
  'greenwood branch': { lat: 47.6960, lng: -122.3557 },
  'high point branch': { lat: 47.5503, lng: -122.3718 },
  'international district branch': { lat: 47.5979, lng: -122.3238 },
  'lake city branch': { lat: 47.7189, lng: -122.2971 },
  'magnolia branch': { lat: 47.6432, lng: -122.3985 },
  'montlake branch': { lat: 47.6419, lng: -122.3079 },
  'newholly branch': { lat: 47.5367, lng: -122.2839 },
  'northeast branch': { lat: 47.6766, lng: -122.2987 },
  'northgate branch': { lat: 47.7063, lng: -122.3255 },
  'queen anne branch': { lat: 47.6374, lng: -122.3569 },
  'rainier beach branch': { lat: 47.5222, lng: -122.2610 },
  'south park branch': { lat: 47.5274, lng: -122.3251 },
  'southwest branch': { lat: 47.5540, lng: -122.3776 },
  'university branch': { lat: 47.6614, lng: -122.3121 },
  'west seattle branch': { lat: 47.5629, lng: -122.3862 },
};

/**
 * Look up Seattle Public Library branch coordinates from a normalized location string.
 * Only applies to strings that explicitly mention "seattle public library" or "spl".
 * Searches for a branch name substring within the location string (case-insensitive).
 * Returns null if no match.
 */
export function lookupSPLBranchCoords(location: string): GeoCoords | null {
  const lower = location.toLowerCase();

  // Only apply to strings that explicitly reference Seattle Public Library or SPL,
  // or that directly name a known branch/central library location.
  // Avoids false positives (e.g. "Fremont Brewing" → "fremont branch") by requiring
  // either an explicit SPL reference or a match against a known branch name.
  const isSPLString =
    lower.includes('seattle public library') ||
    lower.includes('central library') ||
    // Match "spl" as a whole word or common SPL prefix patterns (avoid partial matches)
    /\bspl\b/.test(lower) ||
    // Match "<branch name> branch" patterns from the SPL_BRANCH_COORDS table
    Object.keys(SPL_BRANCH_COORDS).some(branch => branch.endsWith(' branch') && lower.includes(branch));

  if (!isSPLString) return null;

  for (const [branch, coords] of Object.entries(SPL_BRANCH_COORDS)) {
    if (lower.includes(branch)) {
      return coords;
    }
  }

  return null;
}

/**
 * UW building code → coordinates table.
 * Keys are uppercase building codes (e.g. "HUB", "PAT").
 */
const UW_BUILDING_COORDS: Record<string, GeoCoords> = {
  HUB: { lat: 47.6557, lng: -122.3050 },
  PAT: { lat: 47.6532, lng: -122.3115 },
  KNE: { lat: 47.6561, lng: -122.3088 },
  MNY: { lat: 47.6556, lng: -122.3073 },
  MUS: { lat: 47.6553, lng: -122.3060 },
  ART: { lat: 47.6573, lng: -122.3080 },
  HAG: { lat: 47.6575, lng: -122.3095 },
  FAC: { lat: 47.6531, lng: -122.3048 },
  BRK: { lat: 47.6601, lng: -122.3131 },
  HSD: { lat: 47.6508, lng: -122.3076 },
  HSG: { lat: 47.6508, lng: -122.3076 },
  HRC: { lat: 47.6501, lng: -122.3072 },
  HSK: { lat: 47.6508, lng: -122.3076 },
  CHSC: { lat: 47.6589, lng: -122.3037 },
  CUH: { lat: 47.6601, lng: -122.2898 },
  OBS: { lat: 47.6601, lng: -122.3131 },
  PHT: { lat: 47.6561, lng: -122.3088 },
  SAV: { lat: 47.6565, lng: -122.3088 },
  THO: { lat: 47.6565, lng: -122.3076 },
  GWN: { lat: 47.6565, lng: -122.3076 },
  ALB: { lat: 47.6557, lng: -122.3076 },
  MGH: { lat: 47.6557, lng: -122.3057 },
  PAR: { lat: 47.6569, lng: -122.3088 },
  EGL: { lat: 47.6565, lng: -122.3076 },
  LSB: { lat: 47.6557, lng: -122.3057 },
  OAK: { lat: 47.6531, lng: -122.3048 },
  SFCO: { lat: 47.6610, lng: -122.3145 },
  EDP: { lat: 47.6515, lng: -122.3011 },
  SUZ: { lat: 47.6557, lng: -122.3076 },
  EMLB: { lat: 47.6580, lng: -122.2907 },
  // Added 2026-07-02 geo-resolver batch — verified via each building's own listing.
  LAW: { lat: 47.659183, lng: -122.310631 }, // William H. Gates Hall (UW School of Law)
  UWTT: { lat: 47.660745, lng: -122.314667 }, // UW Tower, Building T
};

/**
 * UW named-location fallback (no building code in string).
 * Keys are lowercased location strings.
 */
const UW_NAMED_LOCATIONS: Record<string, GeoCoords> = {
  'anderson hall courtyard': { lat: 47.6553, lng: -122.3035 },
  'uw botanic gardens': { lat: 47.6601, lng: -122.2898 },
  'center for urban horticulture': { lat: 47.6601, lng: -122.2898 },
};

/**
 * Look up UW building coordinates from a location string.
 *
 * Matches:
 * 1. Named UW locations like "anderson hall courtyard" or "uw botanic gardens"
 * 2. Building code in parens: "(HUB)" at end of string or after a comma/space
 *
 * Returns null if no match.
 */
export function lookupUWBuilding(location: string): GeoCoords | null {
  const lower = location.toLowerCase().trim();

  // Check named locations first
  for (const [name, coords] of Object.entries(UW_NAMED_LOCATIONS)) {
    if (lower === name) {
      return coords;
    }
  }

  // Look for "(CODE)" pattern — code is 2-5 uppercase letters/digits
  const match = lower.match(/\(([a-z0-9]{2,5})\)\s*$/i) ??
    lower.match(/,\s*\(([a-z0-9]{2,5})\)/i);
  if (match) {
    const code = match[1].toUpperCase();
    if (code in UW_BUILDING_COORDS) {
      return UW_BUILDING_COORDS[code];
    }
  }

  return null;
}

/**
 * Well-known Seattle venue coordinates table.
 * Keys are lowercased venue names.
 */
const KNOWN_VENUE_COORDS: Record<string, GeoCoords> = {
  'aladdin theater (portland)': { lat: 45.5098, lng: -122.6227 },
  'arts at king street station': { lat: 47.5983, lng: -122.3303 },
  'bell street park': { lat: 47.6149, lng: -122.3445 },
  'belltown yacht club': { lat: 47.6155, lng: -122.3487 },
  'bitterlake community center': { lat: 47.7201, lng: -122.3473 },
  'block 41': { lat: 47.6038, lng: -122.3301 },
  "bubba's roadhouse (sultan)": { lat: 47.8608, lng: -121.8041 },
  'cap hill (rsvp for details)': { lat: 47.6253, lng: -122.3222 },
  'center for urban horticulture': { lat: 47.6573, lng: -122.2904 },
  'central saloon': { lat: 47.6007, lng: -122.3321 },
  'centennial park, 1130 208th street southeast, bothell, wa': { lat: 47.7610, lng: -122.2218 },
  'club comedy seattle': { lat: 47.6176, lng: -122.3499 },
  'culture yard': { lat: 47.6165, lng: -122.3456 },
  'cwb boathouse': { lat: 47.6259, lng: -122.3392 },
  "dave & buster's lynnwood": { lat: 47.8294928, lng: -122.2697503 },
  'discovery park, north parking lot': { lat: 47.6617, lng: -122.4077 },
  'duwamish longhouse': { lat: 47.5612, lng: -122.3598 },
  'fremont studios': { lat: 47.6513746, lng: -122.3556160 },
  'glasswing shop': { lat: 47.6175, lng: -122.3251 },
  'gard vintners, 19151 144th ave. ne unit d, woodinville, wa': { lat: 47.7553, lng: -122.1516 },
  'gorge amphitheatre': { lat: 47.0801, lng: -119.9947 },
  'gould gallery': { lat: 47.6092, lng: -122.3321 },
  'green lake community center': { lat: 47.6803, lng: -122.3285 },
  'hazard factory': { lat: 47.6138, lng: -122.3204 },
  'husky ballpark': { lat: 47.6515, lng: -122.3011 },
  'husky softball stadium': { lat: 47.6555, lng: -122.3009 },
  'husky soccer stadium': { lat: 47.6499, lng: -122.2637 },
  'husky softball stadium, university of washington': { lat: 47.6555, lng: -122.3009 },
  'j. rinehart gallery': { lat: 47.5994, lng: -122.3305 },
  'j rinehart gallery': { lat: 47.5994, lng: -122.3305 },
  'kangaroo & kiwi': { lat: 47.6689, lng: -122.3834 },
  'seattle central college': { lat: 47.6163, lng: -122.3219 },
  'kremwerk': { lat: 47.6202, lng: -122.3374 },
  'kremwerk-timbre room-cherry complex': { lat: 47.6202, lng: -122.3374 },
  'kane hall, university of washington, 4069 spokane ln, seattle, 98105, united states': { lat: 47.6566, lng: -122.3092 },
  'langston hughes performing arts institute': { lat: 47.5969, lng: -122.3165 },
  'meadowbrook community center': { lat: 47.7133, lng: -122.2989 },
  'mercury @ machinewerks': { lat: 47.5983, lng: -122.3237 },
  'mount vernon downtown association': { lat: 48.4206767, lng: -122.337333 },
  'old stove brewery ship canal': { lat: 47.6521302, lng: -122.3645639 },
  'museum of flight': { lat: 47.5186, lng: -122.2967 },
  'neumos': { lat: 47.6134, lng: -122.3203 },
  'neumos & barboza': { lat: 47.6134, lng: -122.3203 },
  'ohm nightclub': { lat: 47.6134, lng: -122.3203 },
  'orient express restaurant & lounge': { lat: 47.5983, lng: -122.3237 },
  'overlake village station pedestrian bridge': { lat: 47.6363, lng: -122.1389 },
  'pacave pizza (spokane)': { lat: 47.6587, lng: -117.4260 },
  'peace of mind brewing': { lat: 47.8316011, lng: -122.3053788 },
  'ravenna-eckstein community center': { lat: 47.6770, lng: -122.3044 },
  'seattle center armory': { lat: 47.6215, lng: -122.3509 },
  'sammamish commons': { lat: 47.6013675, lng: -122.0367582 },
  'shibuya hi-fi': { lat: 47.6134, lng: -122.3203 },
  'spanish ballroom at mcmenamins elks temple': { lat: 47.6120, lng: -122.3321 },
  'the church cantina': { lat: 47.6253, lng: -122.3222 },
  'the astoria (vancouver bc)': { lat: 49.2643, lng: -123.1036 },
  'the crypt (olympia)': { lat: 47.0449, lng: -122.8986 },
  'the gorge amphitheatre': { lat: 47.0801, lng: -119.9947 },
  'the great hall at union station': { lat: 47.6001, lng: -122.3298 },
  'the moore theatre': { lat: 47.6120, lng: -122.3425 },
  'the museum of flight': { lat: 47.5186, lng: -122.2967 },
  'the new frontier lounge': { lat: 47.6677, lng: -122.3829 },
  'the paramount theatre': { lat: 47.6120, lng: -122.3321 },
  'the taproom at pike place': { lat: 47.6097, lng: -122.3425 },
  // Matches the coords/OSM identity in sources/triple_door/ripper.yaml so an
  // off-site event carrying "The Triple Door, ..." (e.g. a Book Larder author
  // event held there) resolves to the same place as the venue's own feed.
  'the triple door': { lat: 47.6082, lng: -122.3387, osmType: 'node', osmId: 2404249354 },
  'twilight cafe & bar': { lat: 45.5886, lng: -122.7319 },
  'vue lounge': { lat: 47.6134, lng: -122.3203 },
  'volunteer park amphitheater': { lat: 47.6372, lng: -122.3150 },
  'wallingford community senior center': { lat: 47.6639, lng: -122.3312 },
  'worksource north seattle': { lat: 47.7097, lng: -122.3359 },
  'worksource north seattle computer lab': { lat: 47.7097, lng: -122.3359 },
  // Seattle University campus buildings (Nominatim doesn't index individual buildings)
  'redhawk center': { lat: 47.6095, lng: -122.3188 },
  'student center, student center 160 fr. leroux conference center': { lat: 47.6095, lng: -122.3188 },
  // Old Rainier Brewery event spaces
  'the mountain room: bar at the r, 3100 airport way south': { lat: 47.5754764, lng: -122.3207484 },
  // --- Added known venues for Nominatim failure fallback ---
  'armistice coffee roosevelt, 6717 roosevelt ave ne, seattle, wa': { lat: 47.6717, lng: -122.3176 },
  'black panther park, seattle, wa': { lat: 47.5280, lng: -122.2690 },
  'eastlake performing arts center, sammamish, wa': { lat: 47.5693, lng: -122.0282 },
  'faye g. allen grand atrium, mohai, 860 terry ave n, seattle, wa, 98109': { lat: 47.6198, lng: -122.3485 },
  'hilltop ale house, 2129 queen anne ave n, seattle, wa 98109': { lat: 47.6402, lng: -122.3570 },
  'kane hall, university of washington, seattle, wa': { lat: 47.6566, lng: -122.3092 },
  'kirkland rotary central station, 1 railroad ave, kirkland, wa': { lat: 47.6768, lng: -122.2057 },
  'lincoln high school theater, seattle, wa': { lat: 47.6663, lng: -122.3275 },
  'meridian playground, 4800 meridian ave n, seattle, wa': { lat: 47.6627, lng: -122.3310 },
  'microsoft lakefront pavilion, mohai, 860 terry ave n, seattle, wa, 98109': { lat: 47.6198, lng: -122.3485 },
  'mohai': { lat: 47.6198, lng: -122.3485 },
  'mohai, 860 terry ave n, seattle, wa, 98109': { lat: 47.6198, lng: -122.3485 },
  'norcliffe conference room, mohai, 860 terry ave n, seattle, wa, 98109': { lat: 47.6198, lng: -122.3485 },
  'occidental square, 117 s washington st, seattle, wa': { lat: 47.6011, lng: -122.3323 },
  'oxbow farm & conservation center, 10819 carnation duvall road northeast, carnation, wa': { lat: 47.5699, lng: -121.9010 },
  'phinney center campus: blue (upper) building, 6532 phinney ave. n., seattle, wa': { lat: 47.6797, lng: -122.3549 },
  'phinney center campus: brick (lower) building, 6532 phinney ave. n., seattle': { lat: 47.6797, lng: -122.3549 },
  'everett performing arts center, 2710 wetmore ave, everett, wa 98201': { lat: 47.9815, lng: -122.2075 },
  'pud auditorium theater, 2320 california st, everett, wa': { lat: 47.9784, lng: -122.2071 },
  'stottle winery covington tasting room, 16783 southeast 272nd street, covington, wa': { lat: 47.3628, lng: -122.1151 },
  'the great hall, 1119 eighth avenue, seattle, 98101': { lat: 47.6087, lng: -122.3295 },
  'the toad house, 1405 northeast mcwilliams road, bremerton, wa': { lat: 47.5824, lng: -122.6229 },
  'the wyncote nw forum, 1119 8th ave, seattle, 98101': { lat: 47.6087, lng: -122.3295 },
  'unexpected productions, 1428 post alley, seattle, wa': { lat: 47.6097, lng: -122.3420 },
  'mill creek city hall north, 15720 main street, mill creek, wa': { lat: 47.8565, lng: -122.2013 },
  'walls of books, 1025 northwest gilman boulevard, #suite e-3, issaquah, wa': { lat: 47.5446, lng: -122.0535 },
  'calvary: the hill': { lat: 47.6174, lng: -122.3180 },
  'town hall, 1119 eighth avenue (at seneca street), seattle, wa': { lat: 47.6090, lng: -122.3299 },
  'foster school of business, founders hall': { lat: 47.6588, lng: -122.3071 },
  'northwest african american museum': { lat: 47.5892, lng: -122.3019 },
  // Seatoday venues not in Nominatim
  'kent ymca': { lat: 47.3804174, lng: -122.1969249 },
  'cascadia college': { lat: 47.7608677, lng: -122.1922103 },
  'newcastle cemetery': { lat: 47.5318872, lng: -122.1673852 },
  'woodinville sports club': { lat: 47.7393494, lng: -122.1426478 },
  // Nominatim fails on "Council Chambers, 600 4th Ave., Floor, Seattle, WA" due to truncated "Floor" suffix
  'council chambers, 600 4th ave., floor, seattle, wa': { lat: 47.6038904, lng: -122.3300986 },
  // 19hz uses "Church Cantina" and "New Frontier Lounge" without leading "The";
  // Nominatim returns no results for these short names but they are already known.
  'church cantina': { lat: 47.6253, lng: -122.3222 },
  'new frontier lounge': { lat: 47.6677, lng: -122.3829 },
  // Magnuson Park Building 30 is a historic NOAA/arts building inside Warren G. Magnuson Park
  'magnuson park building 30 lower conference room, seattle, wa': { lat: 47.6795, lng: -122.2544 },
  // University of Puget Sound verified address: 1567 N Union Ave, Tacoma, WA 98416
  'university of puget sound, 1567 north union avenue, tacoma, washington, 98416': { lat: 47.2643, lng: -122.4842 },
  // Edmonds Bookshop: 111 5th Ave S, Edmonds, WA 98020 (Nominatim found but fails with bare name query)
  'edmonds bookshop': { lat: 47.8101795, lng: -122.3774160 },
  // Workhorse Coworking Edmonds: 123 2nd Ave S Suite 230, Edmonds, WA (stripSuiteFloorSuffixes leaves "230" dangling)
  'workhorse coworking, 123 2nd avenue south, #suite 230, edmonds, wa': { lat: 47.8107897, lng: -122.3809867 },
  // Seatoday intersection: Nominatim can't parse "Ave. North" suffix — bus stop node confirms coords
  'west crockett street and queen anne ave. north, seattle, wa': { lat: 47.6368215, lng: -122.3570590 },
  // Queen Anne Running of the Bulls route start — Nominatim doesn't resolve the
  // "&" intersection format; bus stop node confirms coords
  'queen anne ave n & boston st, seattle, wa 98109': { lat: 47.6383162, lng: -122.3564600 },
  // Farmers market intersection addresses — Nominatim doesn't resolve "between X & Y" format
  'ballard ave nw between 20th ave nw & 22nd ave nw, seattle': { lat: 47.6663, lng: -122.3849 },
  'e barbara bailey way between broadway & 10th ave e, seattle': { lat: 47.6210, lng: -122.3214 },
  '37th ave s & s edmunds st, seattle': { lat: 47.5600, lng: -122.2874 },
  'university way ne between ne 50th st & ne 52nd st, seattle': { lat: 47.6641, lng: -122.3133 },
  // Georgetown Carnival grounds intersection
  'airport way s & 12th ave s, georgetown, seattle, wa 98108': { lat: 47.5451, lng: -122.3230 },
  // Outdoor art walks — neighborhood-level centroids
  'phinney/greenwood neighborhoods, seattle': { lat: 47.6750, lng: -122.3560 },
  '16th ave sw, white center, seattle, wa': { lat: 47.5187, lng: -122.3658 },
  // Seattle Center campus — Fisher Pavilion building not indexed by Nominatim
  'seattle center, fisher pavilion, 305 harrison st, seattle, wa 98109': { lat: 47.6222, lng: -122.3533 },
  // Founders Court: outdoor plaza at Seattle Center. Events emit only the bare name; adding a
  // city qualifier to the key would break the exact match. 206events is Seattle-only so
  // cross-city false-positive is negligible.
  'founders court': { lat: 47.6196, lng: -122.3513 },
  // Pike Place Market constituency office (suite + floor suffix trips Nominatim)
  'pike place market, 93 pike street #317, 3rd floor, seattle, wa 98101': { lat: 47.6097, lng: -122.3422 },
  // The Rendezvous: 2320 2nd Ave, Belltown. Events emit only the bare name; Nominatim can't
  // resolve the short name without an address. Bare key is necessary — city-qualified keys
  // would not match these events.
  'the rendezvous': { lat: 47.6148, lng: -122.3479 },
  // Freighthouse Square: Tacoma event center. Events emit only the bare name (same bare-key
  // constraint as above). Prefix-match would only fire if a separator follows the name.
  'freighthouse square': { lat: 47.2454, lng: -122.4143 },
  // On the Block Creative Marketplace: outdoor vendor market on Capitol Hill's Pike/Pine corridor.
  // Nominatim can't resolve "between X and Y" street-segment format.
  '11th ave between e pike st and e pine st, capitol hill, seattle, wa 98122': { lat: 47.6150, lng: -122.3153 },
  // Caffe Ladro in Edmonds — stale unresolvable cache entry; full-name query resolves correctly
  'caffe ladro, 8403 main street, edmonds, wa': { lat: 47.8079939, lng: -122.3475204 },
  // Green River College Kent Campus — suite/room suffix prevents Nominatim from resolving
  'green river college - kent campus, 417 ramsay way, suite 112, room 282/283, kent, wa': { lat: 47.3845, lng: -122.2352 },
  // Laterus Winery (Maltby/Snohomish) — Nominatim fails on the raw "#Suite b 6"
  // suffix. Forward-geocoded the clean street address (9206 200th St SE,
  // Snohomish, WA); returned house-number match confirmed correct (9206).
  'laterus winery': { lat: 47.8156043, lng: -122.1076431, osmType: 'way', osmId: 6123058 },

  // --- 2026-07-02 geo-resolver batch: "venue name only" unresolvable entries ---
  // Addresses verified against each venue's own site/official listing, then
  // forward-geocoded via Nominatim (never reverse-geocoded street numbers).
  'alki beach bathhouse': { lat: 47.579690, lng: -122.409633 },
  'ashwood playfield': { lat: 47.619285, lng: -122.199640 }, // Bellevue, WA
  'bell harbor patio, seattle': { lat: 47.611143, lng: -122.349210 },
  'bellevue botanical garden': { lat: 47.609144, lng: -122.179506 },
  'bellevue downtown park': { lat: 47.611941, lng: -122.204388 },
  'cal anderson park sun bowl': { lat: 47.615697, lng: -122.318288 },
  'columbia park': { lat: 47.560033, lng: -122.286900 },
  'concord international school': { lat: 47.523505, lng: -122.324305 },
  'federal way town square park': { lat: 47.317826, lng: -122.308114 },
  'firn rooftop bar': { lat: 47.598643, lng: -122.333666 },
  'freeway park': { lat: 47.609164, lng: -122.330511 },
  'fremont social': { lat: 47.651340, lng: -122.355990 },
  'gasworks park': { lat: 47.647548, lng: -122.332751 },
  'kite hill @ gas works park': { lat: 47.647548, lng: -122.332751 },
  'gene coulon memorial beach park': { lat: 47.506975, lng: -122.202523 },
  'golden gardens bathouse': { lat: 47.691780, lng: -122.403968 }, // source spelling, missing "h"
  'herkimer udistrict': { lat: 47.669801, lng: -122.313223 },
  'hing hay park': { lat: 47.598935, lng: -122.325178 },
  'international fountain lawn': { lat: 47.621462, lng: -122.350989 },
  'lake sammamish state park': { lat: 47.553546, lng: -122.066618 },
  'ltd bar & grill': { lat: 47.652156, lng: -122.355222 },
  'magnolia tidelands park': { lat: 47.631102, lng: -122.392797 },
  'magnuson hanger': { lat: 47.682846, lng: -122.260988 }, // source spelling — "Hangar 30"
  'magnuson park amphitheater': { lat: 47.683008, lng: -122.259515 },
  'mohai/lake union park': { lat: 47.627511, lng: -122.336751 },
  'muckleshoot community center, auburn, wa': { lat: 47.250614, lng: -122.104415 },
  'north: bitterlake community center': { lat: 47.7201, lng: -122.3473 }, // matches existing 'bitterlake community center' entry
  'olallie state park, north bend, wa': { lat: 47.433550, lng: -121.708183 },
  'outer planet brewing': { lat: 47.618031, lng: -122.316545 },
  'outside erickson theatre, capitol hill': { lat: 47.614672, lng: -122.321742 },
  'seattle chinese garden': { lat: 47.547655, lng: -122.351107 },
  'seward park': { lat: 47.549776, lng: -122.257754 },
  'south ravenna park, near the tennis court': { lat: 47.669227, lng: -122.302929 },
  'stoup brewing - capitol hill': { lat: 47.611666, lng: -122.320641 },
  'the funhouse': { lat: 47.618796, lng: -122.329222 },
  'the marketplace at factoria, factoria blvd se, bellevue, wa': { lat: 47.573361, lng: -122.170042 },
  'union station plaza': { lat: 47.599281, lng: -122.330056 },
  'university friends meeting house': { lat: 47.656262, lng: -122.318924 },
  'vashon center for the arts': { lat: 47.428756, lng: -122.460132 },
  'washington park arboretum': { lat: 47.639935, lng: -122.294347 },
  'westlake park': { lat: 47.610900, lng: -122.336900 },
  'youngstown cultural arts center theater': { lat: 47.563585, lng: -122.363035 },
  'bainbridge performing arts center': { lat: 47.626104, lng: -122.518500 },
  'bainbridge arts and crafts': { lat: 47.624713, lng: -122.520378 },
  'darrington bluegrass music park': { lat: 48.257213, lng: -121.613039 },
  'darrington music park': { lat: 48.257213, lng: -121.613039 },
  "tony v's garage": { lat: 47.979183, lng: -122.206860 }, // Everett, WA
  "burien farmer's market": { lat: 47.467057, lng: -122.340214 },
  'burien farmer’s market': { lat: 47.467057, lng: -122.340214 }, // curly-apostrophe source variant
  // SPL ID/Chinatown branch + study room suffix that lookupSPLBranchCoords misses
  // (the "/chinatown" text breaks the branch substring match) — same coords as
  // the 'international district branch' entry in SPL_BRANCH_COORDS.
  'international district/chinatown branch, study room': { lat: 47.5979, lng: -122.3238 },

  // Intersection (no street number) that Nominatim's structured geocoder
  // can't resolve directly — derived from the bounded 6th Ave S segment
  // between S King St and S Weller St in the CID (OSM way 260316654),
  // whose south endpoint (47.5975244) is the Weller St intersection.
  '6th ave s & s weller st, seattle, wa 98104': { lat: 47.5975, lng: -122.3264 },

  // --- 2026-07-05 geo-resolver batch: more "venue name only" / address-format unresolvable entries ---
  // Addresses verified against each venue's own site/official listing, then
  // forward-geocoded via Nominatim (never reverse-geocoded street numbers).
  'campion ballroom': { lat: 47.6068, lng: -122.3195 }, // Seattle University, Campion Hall
  'bill wright golf complex': { lat: 47.5660, lng: -122.3091 }, // Jefferson Park Par 3 Course
  'gallery axis': { lat: 47.5997, lng: -122.3340 },
  'sarajevo nightclub': { lat: 47.6123, lng: -122.3465 },
  'salish steps': { lat: 47.6089, lng: -122.3428 }, // Overlook Walk, Seattle Waterfront Park
  'picklewood paddle club': { lat: 47.5673, lng: -122.3352 },
  'radiant self, institute of awakened mastery, seattle, wa': { lat: 47.6991, lng: -122.3283 },
  // Cougar Mountain Regional Wildland Park centroid — source names a specific
  // trailhead within the park that Nominatim doesn't index separately.
  'sky country trailhead cougar mountain, bellevue, wa': { lat: 47.5280, lng: -122.1038 },
  'the chapel lounge': { lat: 47.6003, lng: -122.3344 },
  // Source misspells "Evans" as "Evan"
  'park pointe, southeast evan street, issaquah, wa': { lat: 47.5254, lng: -122.0314 },
  'manchester state park group camp site': { lat: 47.5766, lng: -122.5499 },
  'cooley llp, seattle, united states': { lat: 47.6140, lng: -122.3353 },
  'bainbridge island pac town square': { lat: 47.6261, lng: -122.5185 },
  'red hawk avalon': { lat: 46.5532, lng: -123.3661 }, // Pe Ell, WA
  'the 4bs': { lat: 47.6591, lng: -122.3645 },
  // ARTS at King Street Station — prefix-matches all "303 South Jackson Street, <room>"
  // variants (3rd floor lounge/living room, plaza, top floor) since lookupKnownVenue
  // matches on a leading-substring + separator, not just the existing
  // 'arts at king street station' name-based key.
  '303 south jackson street': { lat: 47.5983, lng: -122.3303 },
  'pier 58 park': { lat: 47.6068, lng: -122.3417 },
  // Approximate downtown-Kent block; source intersection (2nd & Harrison) isn't indexed
  'kent, 2nd & harrison streets, kent, wa, 98032, united states': { lat: 47.3775, lng: -122.2349 },
  'occidental ave. s (between s. jackson st and s. main st.)': { lat: 47.6005, lng: -122.3331 }, // Occidental Park

  // --- 2026-07-12 geo-resolver batch: more "venue name only" unresolvable entries ---
  // Addresses verified via Nominatim forward-geocode of the venue's own name/address.
  'gorge amphitheater': { lat: 47.0801, lng: -119.9947 }, // spelling variant of 'gorge amphitheatre'
  'dr. blanche lavizzo park amphitheater': { lat: 47.6004282, lng: -122.3043195 },
  'elisabeth c. miller library (emlb)': { lat: 47.6580467, lng: -122.2906731 },
  'green lake aqua theatre': { lat: 47.6715091, lng: -122.3425131 },
  'old stove - ship canal': { lat: 47.6521302, lng: -122.3645639 }, // matches 'old stove brewery ship canal'
  'rainier vista (across the bridge from uw station)': { lat: 47.6528417, lng: -122.3071288 },
  'uw tower building t (uwtt)': { lat: 47.6607450, lng: -122.3146673 },
  'william h. gates hall (law)': { lat: 47.6591829, lng: -122.3108801 },
  'bainbridge island ferry terminal, ferry dock, bainbridge island, wa': { lat: 47.6231022, lng: -122.5119696 },
  'lynwood light rail': { lat: 47.8155698, lng: -122.2948846 }, // source spelling of "Lynnwood City Center Station"
  // Mt Baker Light Rail Station — source describes meeting "just off Rainier Ave S & S Forest St, by the Mt Baker Light Rail Station"
  'we meet on the nw corner of the art space building, just off rainier ave. s. & s. forest st., by the mt. baker light rail station.': { lat: 47.5767, lng: -122.2978 },
  'seattle aquarium, 1483 alaskan way pier 59, seattle, wa 98101': { lat: 47.6076, lng: -122.3432 },
  '1483 alaskan way pier 59, seattle, wa 98101': { lat: 47.6076, lng: -122.3432 },
  '1620 12th ave (12th ave arts building)': { lat: 47.6157, lng: -122.3167 },
  'b612 gallery: pioneer square, 1915 1st ave south': { lat: 47.5855, lng: -122.3345 },

  // --- 2026-07-07 geo-resolver batch: "has street address" unresolvable entries ---
  // Nominatim fails on the raw source strings (unit/suite suffixes, duplicated
  // address text, trailing "and <second address>"); forward-geocoded the clean
  // address via Nominatim and keyed on the shared prefix so messy suffixes
  // still prefix-match.
  '3131 western ave': { lat: 47.6183937, lng: -122.3573615 }, // Seattle, WA 98121
  '601 union st': { lat: 47.6099437, lng: -122.3325277 }, // Seattle, WA 98101
  '9zero climate innovation hub': { lat: 47.6074818, lng: -122.3348689 }, // 1215 4th Ave, Seattle
  'tower 1201': { lat: 47.6071707, lng: -122.3360996 }, // 1201 3rd Ave, Seattle
  '4316 sw othello st': { lat: 47.5384463, lng: -122.3882400 }, // Delridge, Seattle
  '2050 s jackson st, seattle, wa 98144': { lat: 47.5993421, lng: -122.3055056 }, // Central District
  '2446 nw market st.': { lat: 47.6688337, lng: -122.3896468 }, // Ballard
  '12501 28th ave.': { lat: 47.7197568, lng: -122.2981467 }, // Lake City
  '15835 ne 36th st': { lat: 47.6413003, lng: -122.1291602 }, // Microsoft Redmond East Campus
  '5020 148th ave ne': { lat: 47.6528889, lng: -122.1422261 }, // Microsoft Redmond Woods
  '411 108th ave ne, bellevue': { lat: 47.6141268, lng: -122.1966928 },
  '18220 campus way ne, bothell': { lat: 47.7599575, lng: -122.1902704 }, // UW Bothell ARC
  '3711 196th street sw, lynnwood': { lat: 47.8214542, lng: -122.2837643 }, // Lynnwood Event Center
  'downtown port townsend, wa': { lat: 48.1179702, lng: -122.7695440 }, // city centroid
  'hillman city business district': { lat: 47.5524351, lng: -122.2749152 },
  'the square at u district station': { lat: 47.6604917, lng: -122.3141330 },
  // Seattle City Hall — additional room/floor suffix variant of the existing
  // 'council chambers, 600 4th ave., floor, seattle, wa' entry above. Exact
  // match only (not a prefix) so it doesn't hijack unrelated "600 4th Ave,
  // Seattle, WA 98104" addresses that should still geocode normally.
  '600 4th ave, floor l2, rm 280': { lat: 47.6038904, lng: -122.3300986 },

  // --- 2026-07-16 geo-resolver batch: hybrid "Online or in-person at <venue>"
  // fallbacks. Only reached via extractTrailingAtLocation()'s known-venue-only
  // probe (see resolveEventCoords) — never geocoded live, since a stripped
  // fragment missing its street/city qualifier can silently Nominatim-match
  // the wrong nearby address (confirmed: "9131 California SW, West Seattle"
  // without "Ave"/"Seattle, WA" mismatches to an unrelated business 800m away).
  // Coords below are forward-geocoded from the full, verified source address.
  'seattle city hall': { lat: 47.6038904, lng: -122.3300986, osmType: 'way', osmId: 111557287 },
  // West Seattle Blog: "Online or at Fauntleroy Schoolhouse @ 9131 California SW, West Seattle"
  '9131 california sw': { lat: 47.5217017, lng: -122.3878878, osmType: 'node', osmId: 8377320043 },
  // West Seattle Blog: "Online or in-person @ 6115 SW Hinds, West Seattle"
  '6115 sw hinds': { lat: 47.5737709, lng: -122.4116683, osmType: 'node', osmId: 2416651609 },
};

/**
 * If a vague/hybrid location string ("Online or in-person at X", "Virtual or @ Y")
 * names a real physical fallback location after a trailing "at "/"@ " marker,
 * extract just that trailing portion (the last such marker in the string wins,
 * so a named venue followed by its own "@ address" resolves to the address).
 *
 * The result is intended ONLY as a probe key for lookupKnownVenue() — a curated,
 * human-verified table — and must never be sent to Nominatim directly. A
 * fragment stripped of its originating context (missing "Ave", city qualifier,
 * etc.) can silently geocode to the wrong nearby address; see the batch note
 * above KNOWN_VENUE_COORDS for a confirmed example.
 *
 * Returns null if no "at "/"@ " marker is found.
 */
export function extractTrailingAtLocation(location: string): string | null {
  const lower = location.toLowerCase();
  const atSignIdx = location.lastIndexOf('@');
  const atWordIdx = lower.lastIndexOf(' at ');
  if (atSignIdx === -1 && atWordIdx === -1) return null;

  const start = atSignIdx > atWordIdx ? atSignIdx + 1 : atWordIdx + 4;
  const candidate = location.slice(start).trim().replace(/\s+/g, ' ');
  return candidate.length > 0 ? candidate : null;
}

/**
 * Look up a well-known Seattle venue by normalized (lowercased, trimmed) location string.
 * If the location *starts with* a known venue name, return that venue's coords
 * even if there's trailing room/floor info after the venue name.
 *
 * Returns null if no match.
 */
export function lookupKnownVenue(location: string): GeoCoords | null {
  const lower = location.toLowerCase().trim();

  // Exact match first
  if (lower in KNOWN_VENUE_COORDS) {
    return KNOWN_VENUE_COORDS[lower];
  }

  // Prefix match: location starts with a known venue name followed by a separator
  for (const [name, coords] of Object.entries(KNOWN_VENUE_COORDS)) {
    if (lower.startsWith(name) && lower.length > name.length) {
      const nextChar = lower[name.length];
      // Only match if followed by a separator (, - : space)
      if (nextChar === ',' || nextChar === ' ' || nextChar === '-' || nextChar === ':') {
        return coords;
      }
    }
  }

  return null;
}

/**
 * Known venue-area suffix patterns that map to a centroid.
 * Used as a last-resort fallback when Nominatim fails and the location string
 * contains a recognizable area suffix like ", seattle center" or ", south lake union".
 *
 * Keys are lowercase area suffixes; values are centroids.
 */
const VENUE_AREA_SUFFIX_COORDS: Record<string, GeoCoords> = {
  'seattle center': { lat: 47.6205, lng: -122.3493 },
  'south lake union': { lat: 47.6275, lng: -122.3362 },
  'south lake union, seattle, wa': { lat: 47.6275, lng: -122.3362 },
  'south lake union, seattle': { lat: 47.6275, lng: -122.3362 },
};

/**
 * Check if the location ends with a known venue-area suffix (e.g. ", seattle center"
 * or ", south lake union, seattle, wa"). Returns the centroid if matched, null otherwise.
 *
 * Matches case-insensitively. The area suffix must appear after a comma or space.
 */
export function lookupVenueAreaFallback(location: string): GeoCoords | null {
  const lower = location.toLowerCase().trim();

  for (const [suffix, coords] of Object.entries(VENUE_AREA_SUFFIX_COORDS)) {
    // Match exactly equal, or ending with ", <suffix>"
    if (
      lower === suffix ||
      lower.endsWith(`, ${suffix}`) ||
      lower.endsWith(` ${suffix}`)
    ) {
      return coords;
    }
  }

  return null;
}

export async function loadGeoCache(filePath: string): Promise<GeoCache> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Validate the basic shape before trusting it; fall back to empty cache on corruption.
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.version === 'number' &&
      typeof parsed.entries === 'object' &&
      parsed.entries !== null
    ) {
      return parsed as GeoCache;
    }
    console.warn(`geo-cache.json has unexpected shape, starting with empty cache`);
    return { version: 1, entries: {} };
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return { version: 1, entries: {} };
    }
    if (err instanceof SyntaxError) {
      // Corrupted JSON (e.g. incomplete write on previous crash) — start fresh
      console.warn(`geo-cache.json is not valid JSON, starting with empty cache: ${err.message}`);
      return { version: 1, entries: {} };
    }
    throw err;
  }
}

export async function saveGeoCache(cache: GeoCache, filePath: string): Promise<void> {
  await writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export function lookupGeoCache(cache: Readonly<GeoCache>, location: string): GeoCoords | null {
  const key = normalizeLocationKey(location);
  const entry = cache.entries[key];
  if (!entry) return null;
  if (entry.unresolvable) return null;
  if (entry.lat !== undefined && entry.lng !== undefined) {
    return {
      lat: entry.lat,
      lng: entry.lng,
      ...(entry.osmId !== undefined && entry.osmType !== undefined
        ? { osmId: entry.osmId, osmType: entry.osmType }
        : {}),
    };
  }
  return null;
}

// Rate limit state for Nominatim API (1 req/sec required by usage policy).
//
// Safety note: geocodeLocation is called only from resolveEventCoords, which is
// called sequentially in calendar_ripper.ts — each call is `await`ed before the
// next begins (no Promise.all or concurrent fan-out). This makes lastNominatimCallTime
// effectively single-threaded: only one call can be in-flight at a time, so reads
// and writes to this variable are race-free. If the calling code is ever parallelized,
// this variable must be replaced with a proper serialization queue.
let lastNominatimCallTime = 0

/** Geocode telemetry, surfaced in the build report so geocoding's contribution
 *  to build time is observable. The first three are per-location no-network
 *  resolutions: `cacheHits` from the geo-cache, `knownVenueHits` from the
 *  hardcoded table, `unresolvableSkips` from a cached `unresolvable` marker.
 *  `networkLookups` counts locations (once each) that fell through to the
 *  network path; those four are mutually exclusive per location and sum to the
 *  total locations resolved. `nominatimCalls` is a separate raw count of
 *  Nominatim HTTP requests — the throttled ~1 req/sec cost — which can exceed
 *  `networkLookups` because one location may try several candidate strings. */
export interface GeocodeStats {
  cacheHits: number;
  knownVenueHits: number;
  unresolvableSkips: number;
  networkLookups: number;
  nominatimCalls: number;
}

function emptyGeocodeStats(): GeocodeStats {
  return { cacheHits: 0, knownVenueHits: 0, unresolvableSkips: 0, networkLookups: 0, nominatimCalls: 0 };
}

let geocodeStats: GeocodeStats = emptyGeocodeStats();

/** Reset the geocode counters — call once at the start of a build. */
export function resetGeocodeStats(): void {
  geocodeStats = emptyGeocodeStats();
}

/** Snapshot of the geocode counters — read after the build's geocoding phases. */
export function getGeocodeStats(): GeocodeStats {
  return { ...geocodeStats };
}

export async function geocodeLocation(location: string): Promise<GeoCoords | null> {
  geocodeStats.nominatimCalls++;
  // Rate limit: enforce 1 req/sec before making the Nominatim call.
  // Capture a single timestamp snapshot, compute the required delay, then
  // record (now + delay) as the next allowed call time before awaiting — this
  // means lastNominatimCallTime always reflects the scheduled fire time, not
  // the time we started waiting, and never requires a second Date.now() call.
  const now = Date.now()
  const elapsed = now - lastNominatimCallTime
  const delay = lastNominatimCallTime > 0 ? Math.max(0, 1000 - elapsed) : 0
  lastNominatimCallTime = now + delay
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  const encoded = encodeURIComponent(location);
  const vb = CITY.geocoder.nominatimViewbox;
  const viewbox = `${vb.west},${vb.south},${vb.east},${vb.north}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=us&viewbox=${viewbox}&bounded=1`;

  // Build a 10-second abort signal. Guard the AbortSignal.timeout() call in case
  // the runtime environment doesn't support it (graceful degradation).
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(10_000)
    : undefined

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': CITY.geocoder.nominatimUserAgent,
      },
      ...(signal ? { signal } : {}),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json() as Array<{
      lat: string;
      lon: string;
      osm_id?: number;
      osm_type?: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const first = data[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (isNaN(lat) || isNaN(lng)) return null;

    const osmType = normalizeOsmType(first.osm_type);
    const osmId = typeof first.osm_id === 'number' && Number.isInteger(first.osm_id) && first.osm_id > 0
      ? first.osm_id
      : undefined;

    return {
      lat,
      lng,
      ...(osmType && osmId !== undefined ? { osmId, osmType } : {}),
    };
  } catch {
    return null;
  }
}

function normalizeOsmType(value: unknown): OsmType | undefined {
  if (value === 'node' || value === 'way' || value === 'relation') return value;
  return undefined;
}

export interface ResolveEventCoordsResult {
  coords: GeoCoords | null;
  geocodeSource: 'ripper' | 'cached' | 'none';
  error?: GeocodeError;
  /** Updated cache — new object if a new entry was added, same reference if unchanged. */
  cache: GeoCache;
}

/**
 * Pure-function geocode resolver. Takes an immutable cache snapshot and returns
 * a new cache object (with the new entry merged in) alongside the result.
 * No shared mutable state is modified — the caller is responsible for storing
 * the returned cache and persisting it to disk.
 *
 * Resolution order:
 * 0. Check for vague locations (TBA, Offsite, etc.) - probe KNOWN_VENUE_COORDS
 *    for a hybrid remote/in-person fallback venue (see extractTrailingAtLocation)
 *    before giving up and marking unresolvable
 * 1. Google Maps URL extraction (before normalization)
 * 2. normalizeLocation()
 * 3. Cache lookup
 * 4. Nominatim geocoding (with venue-prefix fallback)
 * 5. Neighborhood centroid lookup (if Nominatim fails)
 * 6. SPL branch lookup (if Nominatim fails and location mentions a branch)
 * 7. Known venue-area centroid fallback (Seattle Center, South Lake Union, etc.)
 * 8. Suite/floor stripping retry (if first Nominatim attempt fails)
 * 9. UW building lookup (building code in parens, or named UW location)
 * 10. Known venue lookup (well-known Seattle venues that Nominatim misses)
 */
export async function resolveEventCoords(
  cache: Readonly<GeoCache>,
  location: string | undefined,
  sourceName: string,
): Promise<ResolveEventCoordsResult> {
  if (!location || location.trim() === '') {
    return { coords: null, geocodeSource: 'none', cache };
  }

  // Step 0: Check for vague/unresolvable locations (Offsite, TBA, etc.)
  if (isVagueLocation(location)) {
    // Some vague-prefixed strings are hybrid remote/in-person events that name
    // a real physical fallback ("Online or in-person at Seattle City Hall").
    // Probe a curated, human-verified table ONLY (never Nominatim — see
    // extractTrailingAtLocation's docstring for why a stripped fragment can't
    // be geocoded live) so these resolve without risking a bad auto-match.
    const preNormalized = normalizeLocation(location);
    const trailingCandidate = extractTrailingAtLocation(preNormalized);
    const hybridVenueCoords =
      lookupKnownVenue(preNormalized) ?? (trailingCandidate !== null ? lookupKnownVenue(trailingCandidate) : null);

    if (hybridVenueCoords !== null) {
      geocodeStats.knownVenueHits++;
      const key = normalizeLocationKey(location);
      const knownEntry: GeoCacheEntry = {
        lat: hybridVenueCoords.lat,
        lng: hybridVenueCoords.lng,
        ...(hybridVenueCoords.osmId !== undefined && hybridVenueCoords.osmType !== undefined
          ? { osmId: hybridVenueCoords.osmId, osmType: hybridVenueCoords.osmType }
          : {}),
        geocodedAt: new Date().toISOString().slice(0, 10),
        source: 'nominatim',
        firstSeen: new Date().toISOString().slice(0, 10),
      };
      return {
        coords: hybridVenueCoords,
        geocodeSource: 'ripper',
        cache: { ...cache, entries: { ...cache.entries, [key]: knownEntry } },
      };
    }

    const key = normalizeLocationKey(location);
    const newEntry: GeoCacheEntry = {
      unresolvable: true,
      geocodedAt: new Date().toISOString().slice(0, 10),
      source: 'nominatim',
      firstSeen: new Date().toISOString().slice(0, 10),
    };
    const updatedCache: GeoCache = {
      ...cache,
      entries: { ...cache.entries, [key]: newEntry },
    };
    const error: GeocodeError = {
      type: 'GeocodeError',
      location,
      source: sourceName,
      reason: 'Vague/unresolvable location',
    };
    return { coords: null, geocodeSource: 'none', error, cache: updatedCache };
  }

  // Step 1: Google Maps URL extraction — do this BEFORE normalization
  const googleMapsExtracted = await extractFromGoogleMapsUrl(location);
  const rawLocation = googleMapsExtracted ?? location;

  // Step 2: Normalize the raw location string before any cache lookup or geocoding.
  // This ensures HTML tags, ICS-escaped commas, and extra whitespace don't
  // cause spurious cache misses or Nominatim failures.
  const normalized = normalizeLocation(rawLocation);

  if (normalized === '') {
    return { coords: null, geocodeSource: 'none', cache };
  }

  const cached = lookupGeoCache(cache, normalized);
  if (cached !== null) {
    geocodeStats.cacheHits++;
    return { coords: cached, geocodeSource: 'cached', cache };
  }

  const key = normalizeLocationKey(normalized);

  // Check KNOWN_VENUE_COORDS before the unresolvable cache short-circuit so that
  // adding a hardcoded entry overrides a stale unresolvable marker in the geo-cache.
  const knownVenueCoords = lookupKnownVenue(normalized);
  if (knownVenueCoords !== null) {
    geocodeStats.knownVenueHits++;
    const knownEntry: GeoCacheEntry = {
      lat: knownVenueCoords.lat,
      lng: knownVenueCoords.lng,
      geocodedAt: new Date().toISOString().slice(0, 10),
      source: 'nominatim',
      firstSeen: new Date().toISOString().slice(0, 10),
    };
    return { coords: knownVenueCoords, geocodeSource: 'ripper', cache: { ...cache, entries: { ...cache.entries, [key]: knownEntry } } };
  }

  // Already known unresolvable — no network call needed
  const entry = cache.entries[key];
  if (entry?.unresolvable) {
    geocodeStats.unresolvableSkips++;
    return { coords: null, geocodeSource: 'none', cache };
  }

  // Reached the network path — count this location once (distinct from
  // nominatimCalls, which counts each candidate HTTP attempt below).
  geocodeStats.networkLookups++;

  // Try geocoding the normalized string first.
  // If it looks like "Venue: 1234 Street..." also try the address-only part.
  const addressOnly = extractAddressFromVenuePrefix(normalized);
  const candidates = addressOnly ? [normalized, addressOnly] : [normalized];

  let coords: GeoCoords | null = null;
  for (const candidate of candidates) {
    coords = await geocodeLocation(candidate);
    if (coords !== null) break;
  }

  // Step 3: Neighborhood centroid lookup (if Nominatim failed)
  if (coords === null) {
    coords = lookupNeighborhoodCentroid(normalized);
  }

  // Step 4: SPL branch lookup (if Nominatim and neighborhood failed)
  if (coords === null) {
    coords = lookupSPLBranchCoords(normalized);
  }

  // Step 5: Known venue-area centroid fallback (Seattle Center, South Lake Union, etc.)
  if (coords === null) {
    coords = lookupVenueAreaFallback(normalized);
  }

  // Step 9: UW building lookup (building code in parens, or named UW location)
  if (coords === null) {
    coords = lookupUWBuilding(normalized);
  }

  // Step 6: Suite/floor stripping retry (if still no coords)
  if (coords === null) {
    const stripped = stripSuiteFloorSuffixes(normalized);
    if (stripped !== null) {
      // Also try extracting address from venue prefix of stripped string
      const strippedAddressOnly = extractAddressFromVenuePrefix(stripped);
      const strippedCandidates = strippedAddressOnly ? [stripped, strippedAddressOnly] : [stripped];
      for (const candidate of strippedCandidates) {
        coords = await geocodeLocation(candidate);
        if (coords !== null) break;
      }
    }
  }

  if (coords !== null) {
    const newEntry: GeoCacheEntry = {
      lat: coords.lat,
      lng: coords.lng,
      ...(coords.osmId !== undefined && coords.osmType !== undefined
        ? { osmId: coords.osmId, osmType: coords.osmType }
        : {}),
      geocodedAt: new Date().toISOString().slice(0, 10),
      source: 'nominatim',
      firstSeen: new Date().toISOString().slice(0, 10),
    };
    const updatedCache: GeoCache = {
      ...cache,
      entries: { ...cache.entries, [key]: newEntry },
    };
    return { coords, geocodeSource: 'ripper', cache: updatedCache };
  } else {
    const newEntry: GeoCacheEntry = {
      unresolvable: true,
      geocodedAt: new Date().toISOString().slice(0, 10),
      source: 'nominatim',
      firstSeen: new Date().toISOString().slice(0, 10),
    };
    const updatedCache: GeoCache = {
      ...cache,
      entries: { ...cache.entries, [key]: newEntry },
    };
    const error: GeocodeError = {
      type: 'GeocodeError',
      location,
      source: sourceName,
      reason: 'Nominatim returned no results',
    };
    return { coords: null, geocodeSource: 'none', error, cache: updatedCache };
  }
}
