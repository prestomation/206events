import { readFile, writeFile } from 'fs/promises';
import type { EventCost, EventSetting, UncertaintyField } from './config/schema.js';
import { normalizeLocationKey } from './geocoder.js';

// Resolved values supplied by the event-uncertainty-resolver skill.
// Field names and value shapes match the script CLI in
// skills/event-uncertainty-resolver/scripts/uncertainty-cache.py.
export interface UncertaintyResolutionFields {
    startTime?: string;        // "HH:MM" or "HH:MM:SS" in the event's local timezone
    duration?: number;         // seconds
    location?: string;
    imageUrl?: string;
    cost?: EventCost;          // { min, max? } USD face value, { paid: true }, or { soldOut: true }
    setting?: EventSetting;    // outdoor / indoor / covered — weather-badge eligibility
}

export interface UncertaintyCacheEntry {
    fields?: UncertaintyResolutionFields;
    unresolvable?: boolean;
    reason?: string;
    resolvedAt: string;        // ISO date YYYY-MM-DD
    source: 'manual' | 'agent';
    evidence?: string;         // URL the resolver used to verify the values
    partialFingerprint?: string;
    // ISO date YYYY-MM-DD of the most recent build that consulted this
    // entry. Stamped by lib/calendar_ripper.ts after applyUncertaintyResolutions
    // returns its touchedKeys. Absent on entries that predate this field;
    // prune logic falls back to resolvedAt in that case.
    lastSeen?: string;
}

export interface UncertaintyCache {
    version: number;
    entries: Record<string, UncertaintyCacheEntry>;
}

// Key shape is `${ripperName}:${eventId}`. The ripper name comes from
// the source YAML and the event id comes from the ripper's own stable
// id-generation logic — see AGENTS.md "Stable event IDs".
export function uncertaintyCacheKey(source: string, eventId: string): string {
    return `${source}:${eventId}`;
}

// --- Venue-level setting entries (docs/weather-badges.md, v2) ---------------
//
// A venue's indoor/outdoor nature is a fact about the *place*, not about any
// one event or calendar, so it is cached once per venue and inherited by
// every event — from any source — that resolves to that venue. Entries live
// in the SAME cache under a `venue:` key prefix (never a parallel cache):
//
//   venue:osm:<type>:<id>   — keyed by OpenStreetMap feature identity, the
//                             cross-source join key events already carry
//                             (osmType/osmId from geocoding). Preferred.
//   venue:loc:<normalized>  — fallback for venues that never resolved to an
//                             OSM feature, keyed by the same lowercased/
//                             trimmed location string the geo-cache uses.
//
// The entry shape is unchanged (`fields.setting` or `unresolvable`), so the
// resolver CLI, lastSeen stamping, and prune tooling all work as-is.

export const VENUE_KEY_PREFIX = 'venue:';

export function venueSettingKeyForOsm(osmType: string, osmId: number): string {
    return `venue:osm:${osmType}:${osmId}`;
}

// Uses the geo-cache's own key normalization (normalizeLocationKey) so a
// venue's setting entry and its geocode entry key off the same string —
// whatever spelling variations the sources use.
export function venueSettingKeyForLocation(location: string): string {
    return `venue:loc:${normalizeLocationKey(location)}`;
}

export interface VenueSettingLookupInput {
    osmType?: string;
    osmId?: number;
    location?: string;
}

export interface VenueSettingLookupResult {
    kind: 'resolved' | 'unresolvable' | 'miss';
    setting?: EventSetting;
    /** The cache key that matched (for lastSeen stamping). */
    key?: string;
}

// Resolve a venue-level setting for an event's place: OSM identity first
// (stable across sources and location-string spellings), then the normalized
// location string. An `unresolvable` venue entry is surfaced as such so gap
// queues can self-limit.
export function lookupVenueSetting(
    cache: Readonly<UncertaintyCache>,
    input: VenueSettingLookupInput,
): VenueSettingLookupResult {
    const keys: string[] = [];
    if (input.osmType && input.osmId !== undefined) {
        keys.push(venueSettingKeyForOsm(input.osmType, input.osmId));
    }
    if (input.location) {
        keys.push(venueSettingKeyForLocation(input.location));
    }
    for (const key of keys) {
        const entry = cache.entries[key];
        if (!entry) continue;
        if (entry.unresolvable) return { kind: 'unresolvable', key };
        if (entry.fields?.setting) return { kind: 'resolved', setting: entry.fields.setting, key };
    }
    return { kind: 'miss' };
}

export async function loadUncertaintyCache(filePath: string): Promise<UncertaintyCache> {
    try {
        const raw = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.version === 'number' &&
            typeof parsed.entries === 'object' &&
            parsed.entries !== null
        ) {
            return parsed as UncertaintyCache;
        }
        console.warn(`${filePath} has unexpected shape, starting with empty cache`);
        return { version: 1, entries: {} };
    } catch (err: any) {
        if (err?.code === 'ENOENT') {
            return { version: 1, entries: {} };
        }
        if (err instanceof SyntaxError) {
            console.warn(`${filePath} is not valid JSON, starting with empty cache: ${err.message}`);
            return { version: 1, entries: {} };
        }
        throw err;
    }
}

export async function saveUncertaintyCache(cache: UncertaintyCache, filePath: string): Promise<void> {
    await writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export interface UncertaintyLookupResult {
    kind: 'resolved' | 'unresolvable' | 'miss';
    entry?: UncertaintyCacheEntry;
}

export function lookupUncertaintyCache(
    cache: Readonly<UncertaintyCache>,
    source: string,
    eventId: string,
    partialFingerprint?: string,
): UncertaintyLookupResult {
    const key = uncertaintyCacheKey(source, eventId);
    const entry = cache.entries[key];
    if (!entry) return { kind: 'miss' };

    // If the ripper's parsed data has changed since the resolution was
    // recorded, the resolution is stale — fall through to a miss so the
    // resolver re-investigates against the current upstream content.
    if (
        partialFingerprint !== undefined &&
        entry.partialFingerprint !== undefined &&
        entry.partialFingerprint !== partialFingerprint
    ) {
        return { kind: 'miss' };
    }

    if (entry.unresolvable) return { kind: 'unresolvable', entry };
    if (entry.fields) return { kind: 'resolved', entry };
    return { kind: 'miss' };
}

// All unique fields that any unresolved cache entry could still help with.
// Used for reporting: "X events outstanding for time, Y for location."
export function summarizeOutstandingFields(unknownFields: UncertaintyField[]): string {
    if (unknownFields.length === 0) return '(no fields)';
    return unknownFields.join(', ');
}
