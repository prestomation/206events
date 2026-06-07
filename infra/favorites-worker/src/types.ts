interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    doubles?: number[]
    blobs?: string[]
    indexes?: string[]
  }): void
}

export interface Env {
  USERS: KVNamespace
  FAVORITES: KVNamespace
  FEED_TOKENS: KVNamespace
  // Per-IP rate-limit counters for the feedback endpoint (short-TTL keys).
  RATE_LIMIT?: KVNamespace
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_PAGES_BASE_URL: string
  SITE_URL: string
  // Feedback → GitHub Issues. GITHUB_TOKEN is a secret (fine-grained PAT with
  // Issues:write on GITHUB_REPO); GITHUB_REPO is "owner/repo".
  GITHUB_TOKEN?: string
  GITHUB_REPO?: string
  ANALYTICS?: AnalyticsEngineDataset
}

export interface UserRecord {
  id: string
  provider: string
  providerId: string
  email: string
  name: string
  picture: string
  feedToken: string
  createdAt: string
  lastLoginAt: string
}

export interface GeoFilter {
  lat: number
  lng: number
  radiusKm: number
  label?: string
}

export interface FavoritesRecord {
  icsUrls: string[]
  searchFilters: string[]
  geoFilters: GeoFilter[]
  updatedAt: string
}

// A single named favorites list. Each list owns its own feed token (and thus
// its own ICS subscription URL), plus its own favorited calendars, search
// filters, and geo filters.
export interface FavoriteList {
  id: string            // stable slug; the migrated default list uses "default"
  name: string          // "My Favorites", "Date Night", …
  feedToken: string     // per-list token → per-list ICS URL
  icsUrls: string[]
  searchFilters: string[]
  geoFilters: GeoFilter[]
  createdAt: string
  updatedAt: string
}

// The new shape of a FAVORITES KV value (keyed by userId): a container of
// lists. Replaces the flat FavoritesRecord, which is still read for lazy
// migration.
export interface UserListsRecord {
  lists: FavoriteList[]
  updatedAt: string
}

export interface EventsIndexEntry {
  icsUrl: string
  summary: string
  description?: string
  location?: string
  date: string
  endDate?: string
  url?: string
  lat?: number
  lng?: number
  geocodeSource?: 'ripper' | 'cached' | 'none'
  dedupedSources?: string[]
}

export interface FeedTokenRecord {
  userId: string
  // Which list this token resolves to. Optional for back-compat: tokens minted
  // before multi-list support have no listId and resolve to the user's
  // default (first) list in feed.ts.
  listId?: string
}

export interface JWTPayload {
  sub: string
  exp: number
}
