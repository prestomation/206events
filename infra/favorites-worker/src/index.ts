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

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return ''
    if (origin === 'https://api.206.events') return origin
    if (origin === 'https://206.events') return origin
    if (origin === 'https://prestomation.github.io') return origin
    if (origin.startsWith('http://localhost')) return origin
    if (origin.startsWith('http://127.0.0.1')) return origin
    return ''
  },
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
