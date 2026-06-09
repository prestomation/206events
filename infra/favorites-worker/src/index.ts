// Calendar Ripper Favorites Worker — handles auth, favorites, and feedback
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types.js'
import { authRoutes } from './auth.js'
import { favoritesRoutes } from './favorites.js'
import { searchFiltersRoutes } from './search-filters.js'
import { geoFiltersRoutes } from './geo-filters.js'
import { listsRoutes } from './lists.js'
import { feedRoutes } from './feed.js'
import { feedbackRoutes } from './feedback.js'

const app = new Hono<{ Bindings: Env }>()

// CORS origin allowlist. Echoes the origin back (required for credentialed
// requests) when allowed, else ''. Cloudflare Pages previews for this project
// live under <branch>.206events.pages.dev and call the staging worker with
// credentials; scoped to this exact project subdomain — never bare *.pages.dev,
// which is shared across every Cloudflare account.
export function isAllowedOrigin(origin: string | undefined): string {
  if (!origin) return ''
  if (origin === 'https://api.206.events') return origin
  if (origin === 'https://api-staging.206.events') return origin
  if (origin === 'https://206.events') return origin
  if (origin === 'https://prestomation.github.io') return origin
  if (origin.startsWith('http://localhost')) return origin
  if (origin.startsWith('http://127.0.0.1')) return origin
  try {
    const u = new URL(origin)
    if (u.protocol === 'https:' && (u.hostname === '206events.pages.dev' || u.hostname.endsWith('.206events.pages.dev'))) {
      return origin
    }
  } catch {
    // not a URL — fall through to deny
  }
  return ''
}

app.use('*', cors({
  origin: isAllowedOrigin,
  credentials: true,
}))

app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRoutes)
app.route('/favorites', favoritesRoutes)
app.route('/search-filters', searchFiltersRoutes)
app.route('/geo-filters', geoFiltersRoutes)
app.route('/lists', listsRoutes)
app.route('/feed', feedRoutes)
app.route('/feedback', feedbackRoutes)

export default app
