// Cross-source event de-duplication.
//
// The same real-world event is often listed by several sources, so it shows up
// two or three times in the calendar. This module recognizes those duplicates
// by scoring cross-source event pairs on three rough signals — title token
// overlap, location (OSM / distance / text), and time-range overlap — and
// sorts them into confidence tiers:
//
//   HIGH → auto-merge (collapse + attribute) at build time
//   MED  → duplicate-candidate queue, drained by the duplicate-resolver skill
//   LOW  → ignored
//
// It is a pure, build-time transform over the events-index entries. It only
// MARKS events (a shared `duplicateGroupId` + `dedupedSources` on the
// canonical, `duplicateOf` on the suppressed) — it never drops events or
// touches any .ics feed. See docs/cross-source-event-dedup.md.

export interface DedupEvent {
    icsUrl: string;
    summary: string;
    location?: string;
    date: string;        // js-joda string, e.g. 2026-07-02T17:00-07:00[America/Los_Angeles]
    endDate?: string;
    url?: string;        // carried through for the resolver to investigate; not scored
    lat?: number;
    lng?: number;
    osmType?: 'node' | 'way' | 'relation';
    osmId?: number;
    // Output marks written by applyDuplicateMarks (never set by the matcher's
    // scoring). All members of a HIGH group share `duplicateGroupId`; suppressed
    // members also carry `duplicateOf` (= the group id); the canonical carries
    // `dedupedSources` (icsUrls of the suppressed members) for attribution.
    duplicateGroupId?: string;
    duplicateOf?: string;
    dedupedSources?: string[];
}

export interface PairScore {
    title: number;          // token Jaccard, 0..1
    osmSame: boolean;       // identical OSM feature
    distanceM: number | null; // haversine metres, or null if either lacks coords
    locText: number;        // location-string token Jaccard, 0..1
    timeOverlap: boolean | null; // ranges overlap, or null if a range is unknown
    contradicted: boolean;  // location strings carry conflicting zips (hard veto)
}

export type Tier = 'high' | 'med' | null;

export interface DedupTuning {
    titleGate: number;      // cheap pre-filter floor
    highTitle: number;
    highRadiusM: number;
    medTitle: number;
    medRadiusM: number;
    medLocText: number;
}

// Defaults calibrated against the 2026-06-17 prod snapshot — see
// docs/cross-source-event-dedup.md. Tunable so the probe/tests can sweep them.
export const DEFAULT_TUNING: DedupTuning = {
    titleGate: 0.4,
    highTitle: 0.6,
    highRadiusM: 75,
    medTitle: 0.5,
    medRadiusM: 500,
    medLocText: 0.5,
};

// A stable identity for an events-index entry (matches web/src/lib/eventKey.js).
export function eventKey(e: DedupEvent): string {
    return `${e.summary}|${e.date}`;
}

// icsUrl-qualified key — unique per events-index entry. Used as the internal
// union-find / group identity (two different feeds can share an `eventKey`).
// NFC-normalize so that source data with NFD characters (e.g. ó as o+combining
// acute) matches cache entries that were written with NFC characters.
function fullKey(e: DedupEvent): string {
    return `${e.icsUrl} ${eventKey(e)}`.normalize('NFC');
}

// Unordered, stable key for a pair — the join key for the resolver cache.
export function pairKey(a: DedupEvent, b: DedupEvent): string {
    const ka = fullKey(a), kb = fullKey(b);
    return ka < kb ? `${ka}::${kb}` : `${kb}::${ka}`;
}

function tokens(s: string | undefined): Set<string> {
    const out = new Set<string>();
    for (const t of (s ?? '').toLowerCase().split(/[^a-z0-9]+/)) if (t) out.add(t);
    return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / (a.size + b.size - inter);
}

function haversineM(a: DedupEvent, b: DedupEvent): number | null {
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const c = Math.min(1, s);
    return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

// Local calendar day (YYYY-MM-DD) — the offset-bearing prefix is enough since
// we only group within one timezone (all events are Seattle-local).
export function dayBucket(dateStr: string): string {
    return (dateStr ?? '').slice(0, 10);
}

function instant(dateStr: string | undefined): number | null {
    if (!dateStr) return null;
    const t = Date.parse(dateStr.replace(/\[.*\]$/, ''));
    return Number.isNaN(t) ? null : t;
}

function timeOverlap(a: DedupEvent, b: DedupEvent): boolean | null {
    const as = instant(a.date), ae = instant(a.endDate);
    const bs = instant(b.date), be = instant(b.endDate);
    if (as == null || ae == null || bs == null || be == null) return null;
    return as < be && bs < ae;
}

// Five-digit US ZIPs present in a location string.
function zips(s: string | undefined): Set<string> {
    const out = new Set<string>();
    for (const m of (s ?? '').matchAll(/\b(\d{5})\b/g)) out.add(m[1]);
    return out;
}

// Hard veto: both locations name a ZIP and they share none. Catches geocoding
// bugs where two genuinely different venues cache to identical coords/osmId
// (e.g. Stoup Ballard 98107 vs Stoup Capitol Hill 98122). High precision —
// only fires when both strings actually carry a ZIP.
export function locationContradiction(a: DedupEvent, b: DedupEvent): boolean {
    const za = zips(a.location), zb = zips(b.location);
    if (za.size === 0 || zb.size === 0) return false;
    for (const z of za) if (zb.has(z)) return false;
    return true;
}

export function scorePair(a: DedupEvent, b: DedupEvent): PairScore {
    return {
        title: jaccard(tokens(a.summary), tokens(b.summary)),
        osmSame: !!(a.osmId != null && b.osmId != null && a.osmType === b.osmType && a.osmId === b.osmId),
        distanceM: haversineM(a, b),
        locText: jaccard(tokens(a.location), tokens(b.location)),
        timeOverlap: timeOverlap(a, b),
        contradicted: locationContradiction(a, b),
    };
}

export function tierFor(s: PairScore, tuning: DedupTuning = DEFAULT_TUNING): Tier {
    const near = (r: number) => s.osmSame || (s.distanceM != null && s.distanceM <= r);
    if (!s.contradicted &&
        s.title >= tuning.highTitle &&
        s.timeOverlap === true &&
        near(tuning.highRadiusM)) {
        return 'high';
    }
    if (s.title >= tuning.medTitle &&
        s.timeOverlap !== false &&
        (near(tuning.medRadiusM) || s.locText >= tuning.medLocText)) {
        return 'med';
    }
    return null;
}

export interface DuplicateGroup {
    id: string;                 // duplicateGroupId (the canonical's fullKey)
    canonical: DedupEvent;
    suppressed: DedupEvent[];
    sources: string[];          // dedupedSources: icsUrls of suppressed members
}

export interface DuplicateCandidate {
    key: string;                // pairKey
    a: DedupEvent;
    b: DedupEvent;
    score: PairScore;
}

export interface DedupResult {
    groups: DuplicateGroup[];        // HIGH-tier merges
    candidates: DuplicateCandidate[]; // MED-tier, for the resolver queue
}

// venue/aggregator role of a source, looked up by icsUrl. Provided by the build
// from each source's required `sourceRole`. A missing entry (e.g. an out-of-band
// path that didn't carry one) is treated as a venue — venues are the common case
// and the safe default for the canonical pick.
export type SourceRole = 'venue' | 'aggregator';
export type RoleLookup = (e: DedupEvent) => SourceRole | undefined;

// This pure matcher stays decoupled from the Zod config schema (it operates on
// DedupEvent, not configs), so it declares SourceRole locally. Guard against the
// two declarations drifting: a type-only import (no runtime coupling) that fails
// to compile if the schema enum and this union ever disagree.
type _SourceRoleInSync =
    SourceRole extends import('./config/schema.js').SourceRole
        ? (import('./config/schema.js').SourceRole extends SourceRole ? true : never)
        : never;
const _sourceRoleInSync: _SourceRoleInSync = true;
void _sourceRoleInSync;

// Lower rank wins the canonical slot. Venue (0) outranks aggregator (1); an
// unknown role is treated as a venue so the pick never demotes a real venue
// behind an aggregator just because a role was missing.
function roleRank(role: SourceRole | undefined): number {
    return role === 'aggregator' ? 1 : 0;
}

// Canonical pick within a HIGH group: prefer a venue source over an aggregator,
// then break ties on the lexicographically smallest fullKey. Deterministic and
// independent of input order. When no role lookup is supplied (or every member
// resolves to the same rank) this reduces to the pure-fullKey order, preserving
// the original behavior.
function canonicalOf(events: DedupEvent[], roleOf?: RoleLookup): DedupEvent {
    return [...events].sort((x, y) => {
        const rx = roleRank(roleOf?.(x)), ry = roleRank(roleOf?.(y));
        if (rx !== ry) return rx - ry;
        const kx = fullKey(x), ky = fullKey(y);
        return kx < ky ? -1 : kx > ky ? 1 : 0;
    })[0];
}

/**
 * Find duplicate groups (HIGH) and candidate pairs (MED) across sources.
 *
 * `resolved` folds in the duplicate-resolver cache: a pair marked 'confirmed'
 * is promoted to a merge regardless of tier; 'rejected' is dropped entirely.
 *
 * `roleByIcsUrl` maps each feed's icsUrl to its venue/aggregator role; it only
 * influences which member of a HIGH group becomes canonical (venue wins). It
 * does NOT change tiers or which events match — when omitted, canonical picks
 * fall back to pure-fullKey order.
 */
export function findDuplicates(
    events: DedupEvent[],
    opts: {
        tuning?: DedupTuning;
        resolved?: Map<string, 'confirmed' | 'rejected'>;
        roleByIcsUrl?: Map<string, SourceRole>;
    } = {},
): DedupResult {
    const tuning = opts.tuning ?? DEFAULT_TUNING;
    const resolved = opts.resolved ?? new Map();
    const roleOf: RoleLookup | undefined = opts.roleByIcsUrl
        ? (e) => opts.roleByIcsUrl!.get(e.icsUrl)
        : undefined;

    const byDay = new Map<string, DedupEvent[]>();
    for (const e of events) {
        const d = dayBucket(e.date);
        const arr = byDay.get(d);
        if (arr) arr.push(e); else byDay.set(d, [e]);
    }

    // Union-find over fullKeys for HIGH (and resolver-confirmed) merges.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
        let r = parent.get(x) ?? x;
        if (r !== x) { r = find(r); parent.set(x, r); }
        return r;
    };
    const union = (x: string, y: string) => { parent.set(find(x), find(y)); };
    const keyToEvent = new Map<string, DedupEvent>();
    const candidates: DuplicateCandidate[] = [];
    const candidateSeen = new Set<string>();

    for (const evs of byDay.values()) {
        for (let i = 0; i < evs.length; i++) {
            for (let j = i + 1; j < evs.length; j++) {
                const a = evs[i], b = evs[j];
                if (a.icsUrl === b.icsUrl) continue; // cross-source only
                const score = scorePair(a, b);
                if (score.title < tuning.titleGate) continue;

                const pk = pairKey(a, b);
                const decision = resolved.get(pk);
                if (decision === 'rejected') continue;

                let tier: Tier = tierFor(score, tuning);
                if (decision === 'confirmed') tier = 'high';

                if (tier === 'high') {
                    const ka = fullKey(a), kb = fullKey(b);
                    keyToEvent.set(ka, a); keyToEvent.set(kb, b);
                    union(ka, kb);
                } else if (tier === 'med' && !candidateSeen.has(pk)) {
                    candidateSeen.add(pk);
                    candidates.push({ key: pk, a, b, score });
                }
            }
        }
    }

    // Assemble HIGH groups from the union-find clusters.
    const clusters = new Map<string, DedupEvent[]>();
    for (const k of keyToEvent.keys()) {
        const root = find(k);
        const arr = clusters.get(root);
        if (arr) arr.push(keyToEvent.get(k)!); else clusters.set(root, [keyToEvent.get(k)!]);
    }

    const groups: DuplicateGroup[] = [];
    const mergedKeys = new Set<string>();
    for (const members of clusters.values()) {
        if (members.length < 2) continue;
        const canonical = canonicalOf(members, roleOf);
        const suppressed = members
            .filter(m => m !== canonical)
            .sort((x, y) => (fullKey(x) < fullKey(y) ? -1 : fullKey(x) > fullKey(y) ? 1 : 0));
        for (const m of members) mergedKeys.add(fullKey(m));
        groups.push({
            id: fullKey(canonical),
            canonical,
            suppressed,
            sources: [...new Set(suppressed.map(s => s.icsUrl))].sort(),
        });
    }

    // Drop MED candidates whose members already merged into the same HIGH group.
    const filteredCandidates = candidates.filter(c => {
        const ka = fullKey(c.a), kb = fullKey(c.b);
        return !(mergedKeys.has(ka) && mergedKeys.has(kb) && find(ka) === find(kb));
    });

    groups.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    filteredCandidates.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    return { groups, candidates: filteredCandidates };
}

// Write the duplicate marks onto the events in place. The group members are the
// same object references the matcher received, so this mutates the caller's
// array (the events-index entries) directly.
export function applyDuplicateMarks(groups: DuplicateGroup[]): void {
    for (const g of groups) {
        g.canonical.duplicateGroupId = g.id;
        g.canonical.dedupedSources = g.sources;
        for (const s of g.suppressed) {
            s.duplicateGroupId = g.id;
            s.duplicateOf = g.id;
        }
    }
}

// The committed resolver cache: pairKey -> decision. Populated by the
// duplicate-resolver skill; read by the build to confirm/reject MED candidates.
export interface DuplicateCacheEntry {
    decision: 'confirmed' | 'rejected';
    note?: string;
    resolvedAt?: string;
}
export interface DuplicateCache {
    resolutions: Record<string, DuplicateCacheEntry>;
}

export const EMPTY_DUPLICATE_CACHE: DuplicateCache = { resolutions: {} };

// Parse a raw (JSON) duplicate cache into the resolved-decisions map that
// findDuplicates consumes. Tolerant of a missing/blank file (cold start).
export function resolutionsFromCache(cache: DuplicateCache | null | undefined): Map<string, 'confirmed' | 'rejected'> {
    const map = new Map<string, 'confirmed' | 'rejected'>();
    for (const [k, v] of Object.entries(cache?.resolutions ?? {})) {
        // NFC-normalize keys so cache entries written with precomposed characters
        // still match build-generated keys that may use decomposed form.
        if (v?.decision === 'confirmed' || v?.decision === 'rejected') map.set(k.normalize('NFC'), v.decision);
    }
    return map;
}
