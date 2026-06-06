import { readFile, writeFile } from 'fs/promises';
import type { SerializedRipperCalendarEvent } from './config/schema.js';
import type { UncertaintyResolutionFields } from './event-uncertainty-cache.js';

// Per-post extraction store for the `instagram` ripper type.
//
// Instagram has no parseable feed and is unfetchable from CI (the public
// JSON endpoints are dead and GitHub Actions IPs are rate-limited/blocked),
// and event details are frequently baked into flyer images rather than the
// caption. So extraction is done out of band by the `instagram-source` skill
// (an agent — or Claude fired from CI — reads each post's image + caption with
// vision) and the result is recorded here, keyed by Instagram post id.
//
// This mirrors the persistence model of event-uncertainty-cache.json: an empty
// committed baseline in the repo, the live store in S3, and a committed-wins
// merge at download time so web sessions without S3 access can seed entries.
//
// The `instagram` ripper is a pure reader of this cache — see
// lib/config/instagram.ts. It does NOT call Instagram or any LLM at build time.

export interface InstagramCacheEntry {
    // Whether the agent judged this post to describe a real, dated event.
    // false → the ripper skips it (promo, recap, meme, etc.).
    isEvent: boolean;

    // Event fields, populated when isEvent is true. A field left undefined is
    // surfaced by the ripper as an UncertaintyError (reusing the existing
    // uncertainEvents queue) rather than guessed.
    title?: string;
    date?: string;            // event date, local, YYYY-MM-DD (required to place on a calendar)
    startTime?: string;       // local "HH:MM" or "HH:MM:SS"
    durationSeconds?: number;
    location?: string;
    description?: string;
    imageUrl?: string;        // flyer / post image URL (a link, never image bytes)

    // The Instagram post permalink — used as the event url and as resolution
    // evidence (the agent read this page).
    permalink?: string;

    // Hash of whatever the agent read (caption + image url). When the post is
    // edited upstream the fingerprint changes and the entry is re-read.
    postFingerprint?: string;

    // When isEvent is false, or when the agent could not pin a field, a short
    // human-readable note explaining why.
    reason?: string;

    readAt: string;           // ISO date YYYY-MM-DD the agent recorded this
    source: 'manual' | 'agent';
}

// --- Compile-time coupling to the core event model -------------------------
//
// InstagramCacheEntry deliberately keeps its own field names and splits `date`
// (YYYY-MM-DD) from `startTime` — the runtime model combines them into a single
// ZonedDateTime — so it does not structurally extend the event type. To still
// get type safety as the core model evolves, the assertions below fail to
// compile if a shared field is renamed/removed or its type drifts (e.g.
// `durationSeconds` stops being a number, or `summary`/`url`/`imageUrl` change
// type). Pure types, no runtime cost. This lives in the module (not a .test.ts)
// on purpose: ts-node type-checks the build's import graph, whereas vitest runs
// transpile-only — so a module-level assertion is what's actually enforced in CI.
type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

// One row per cache field that feeds a RipperCalendarEvent. Each maps the
// cache's (non-null) field type to the corresponding core-model field; the row
// errors if the model field is renamed/removed or its type no longer matches.
type _InstagramCacheEntryMatchesEventModel = [
    Assert<IsExact<NonNullable<InstagramCacheEntry['title']>, SerializedRipperCalendarEvent['summary']>>,         // title → summary
    Assert<IsExact<NonNullable<InstagramCacheEntry['description']>, NonNullable<SerializedRipperCalendarEvent['description']>>>,
    Assert<IsExact<NonNullable<InstagramCacheEntry['location']>, NonNullable<SerializedRipperCalendarEvent['location']>>>,
    Assert<IsExact<NonNullable<InstagramCacheEntry['permalink']>, NonNullable<SerializedRipperCalendarEvent['url']>>>,   // permalink → url
    Assert<IsExact<NonNullable<InstagramCacheEntry['imageUrl']>, NonNullable<SerializedRipperCalendarEvent['imageUrl']>>>,
    Assert<IsExact<NonNullable<InstagramCacheEntry['durationSeconds']>, SerializedRipperCalendarEvent['durationSeconds']>>,
    Assert<IsExact<NonNullable<InstagramCacheEntry['startTime']>, NonNullable<UncertaintyResolutionFields['startTime']>>>, // startTime ↔ uncertainty resolver
];

export interface InstagramCache {
    version: number;
    entries: Record<string, InstagramCacheEntry>;
}

// Key shape is `${username}:${postId}`. `username` is the calendar's
// config.username (the IG handle); `postId` is the post shortcode the skill
// extracts from the permalink. The ripper derives event ids from the same key
// so they're stable across builds — see AGENTS.md "Stable event IDs".
export function instagramCacheKey(username: string, postId: string): string {
    return `${username}:${postId}`;
}

export async function loadInstagramCache(filePath: string): Promise<InstagramCache> {
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
            return parsed as InstagramCache;
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

export async function saveInstagramCache(cache: InstagramCache, filePath: string): Promise<void> {
    await writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

// Return all entries for a username, paired with their postId, in deterministic
// (sorted-by-key) order so the ripper's output is stable across builds.
export function entriesForUsername(
    cache: Readonly<InstagramCache>,
    username: string,
): { postId: string; entry: InstagramCacheEntry }[] {
    const prefix = `${username}:`;
    return Object.keys(cache.entries)
        .filter(k => k.startsWith(prefix))
        .sort()
        .map(k => ({ postId: k.slice(prefix.length), entry: cache.entries[k] }));
}
