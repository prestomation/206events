import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

// Format a Date as a js-joda-style string: "2026-02-15T19:00:00-08:00".
// Omits the IANA bracket so day-grouping uses the test-runner timezone.
function toJoda(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}
const future = (days) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(19, 30, 0, 0); return d }

const mockManifest = {
  lastUpdated: '2024-12-13T17:00:00.000Z',
  rippers: [{
    name: 'test-ripper',
    friendlyName: 'Test Ripper',
    calendars: [
      { name: 'cal1', friendlyName: 'Neumos', icsUrl: 'test-ripper-cal1.ics', rssUrl: 'test-ripper-cal1.rss', tags: ['Music', 'Capitol Hill'] },
      { name: 'cal2', friendlyName: 'SIFF', icsUrl: 'test-ripper-cal2.ics', rssUrl: 'test-ripper-cal2.rss', tags: ['Movies'] },
    ],
  }],
  externalCalendars: [],
  recurringCalendars: [],
  tags: ['Music', 'Movies', 'Capitol Hill'],
}
const mockEvents = [
  { icsUrl: 'test-ripper-cal1.ics', summary: 'Jazz Night', description: 'Live jazz', location: 'Neumos, Capitol Hill', date: toJoda(future(2)), lat: 47.61, lng: -122.32 },
  { icsUrl: 'test-ripper-cal2.ics', summary: 'Movie Premiere', description: 'A film', location: 'SIFF', date: toJoda(future(3)) },
]
const mockVenues = {
  generated: '',
  venues: [{
    name: 'neumos', friendlyName: 'Neumos', tags: ['Music', 'Capitol Hill'], kind: 'ripper',
    geo: { lat: 47.61, lng: -122.32, label: 'Capitol Hill' },
    calendars: [{ name: 'cal1', friendlyName: 'Neumos', links: { ics: { href: 'test-ripper-cal1.ics' } } }],
  }],
}

function mockFetch(url) {
  const u = String(url)
  const json = (data) => Promise.resolve({ ok: true, json: async () => data, text: async () => '' })
  if (u.includes('manifest.json')) return json(mockManifest)
  if (u.includes('events-index.json')) return json(mockEvents)
  if (u.includes('venues.json')) return json(mockVenues)
  if (u.includes('tags.json')) return json([])
  if (u.includes('build-errors.json')) return json({ buildTime: '', totalErrors: 0, sources: [] })
  if (u.endsWith('.ics')) return Promise.resolve({ ok: true, text: async () => 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR' })
  return json({})
}

const clickNav = (label) => fireEvent.click(screen.getAllByText(label)[0].closest('button'))

describe('App206 redesign', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
    global.fetch = vi.fn(mockFetch)
  })

  // "Discover" appears in the nav AND the page heading; wait on a card instead.
  const waitDiscover = () => waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())

  it('renders the Discover view with channels', async () => {
    render(<App />)
    await waitDiscover()
    expect(screen.getByText('Neumos')).toBeInTheDocument()
    expect(screen.getByText('SIFF')).toBeInTheDocument()
  })

  it('exposes Category and Neighborhood filter dropdowns', async () => {
    const { container } = render(<App />)
    await waitDiscover()
    const catBtn = [...container.querySelectorAll('.a-dd-btn')].find((b) => b.textContent.includes('Category'))
    expect(catBtn).toBeTruthy()
    fireEvent.click(catBtn)
    // "Music" and "Movies" are activity tags, so they become category options.
    await waitFor(() => expect(container.querySelector('.a-dd-menu')).toBeTruthy())
    const labels = [...container.querySelectorAll('.a-dd-menu .a-dd-item-label')].map((e) => e.textContent)
    expect(labels).toContain('Movies')
    expect(labels).toContain('Music')
  })

  it('switches Discover to Events mode and lists events by day', async () => {
    render(<App />)
    await waitDiscover()
    fireEvent.click(screen.getByText('Events').closest('button'))
    await waitFor(() => expect(screen.getByText('Jazz Night')).toBeInTheDocument())
    expect(screen.getByText('Movie Premiere')).toBeInTheDocument()
  })

  it('opens a channel detail when a card is clicked', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Neumos'))
    await waitFor(() => expect(screen.getByText('Add to my calendar app')).toBeInTheDocument())
  })

  it('channel detail calendar actions use working links (webcal anchor, https Google, copy)', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Neumos'))
    await waitFor(() => expect(screen.getByText('Add to my calendar app')).toBeInTheDocument())
    // "Add to my calendar app" is a real webcal anchor (not a dead button).
    const subscribe = screen.getByText('Add to my calendar app').closest('a')
    expect(subscribe).toBeTruthy()
    expect(subscribe.getAttribute('href')).toMatch(/^webcal:/)
    // Google opens a real https Google "add by URL" link in a new tab.
    const google = screen.getByText('Google').closest('a')
    expect(google.getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com/)
    expect(google.getAttribute('target')).toBe('_blank')
    // Copy fallback exists for desktop users without a webcal handler.
    expect(screen.getByText('Subscription link')).toBeInTheDocument()
    // A deep-link share button copies the current page URL.
    expect(screen.getByText('Copy link')).toBeInTheDocument()
  })

  it('navigates to Following and shows the empty feed prompt', async () => {
    render(<App />)
    await waitDiscover()
    clickNav('Following')
    await waitFor(() => expect(screen.getByText('Build your feed')).toBeInTheDocument())
  })

  it('navigates to You and shows the source sections', async () => {
    render(<App />)
    await waitDiscover()
    clickNav('You')
    await waitFor(() => expect(screen.getByText('Saved searches')).toBeInTheDocument())
    expect(screen.getByText('Location filters')).toBeInTheDocument()
  })

  it('following a channel updates the feed source count', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    fireEvent.click(container.querySelector('.pill-follow'))
    clickNav('Following')
    await waitFor(() => expect(screen.getByText('1 calendars')).toBeInTheDocument())
  })

  it('search is a single top-bar input that filters Events and shows an active-filter chip', async () => {
    render(<App />)
    await waitDiscover()
    // Exactly one search input, no duplicate search bar.
    const inputs = screen.getAllByPlaceholderText('Search events & venues…')
    expect(inputs.length).toBe(1)
    fireEvent.click(screen.getByText('Events').closest('button'))
    await waitFor(() => expect(screen.getByText('Jazz Night')).toBeInTheDocument())
    fireEvent.change(inputs[0], { target: { value: 'jazz' } })
    // Debounced commit narrows the list and shows the active-filter chip.
    await waitFor(() => expect(screen.getByText(/Searching:/)).toBeInTheDocument(), { timeout: 2000 })
    await waitFor(() => expect(screen.queryByText('Movie Premiere')).not.toBeInTheDocument())
    expect(screen.getByText('Jazz Night')).toBeInTheDocument()
  })

  it('clearing the active search chip removes the filter', async () => {
    const { container } = render(<App />)
    await waitDiscover()
    fireEvent.click(screen.getByText('Events').closest('button'))
    const input = screen.getAllByPlaceholderText('Search events & venues…')[0]
    fireEvent.change(input, { target: { value: 'jazz' } })
    await waitFor(() => expect(screen.getByText(/Searching:/)).toBeInTheDocument(), { timeout: 2000 })
    fireEvent.click(container.querySelector('.a-fchip-x'))
    await waitFor(() => expect(screen.queryByText(/Searching:/)).not.toBeInTheDocument())
    expect(screen.getByText('Movie Premiere')).toBeInTheDocument()
  })

  describe('map favorites scoping', () => {
    it('desktop map mirrors the section — scopes to the feed on Following', async () => {
      const { container } = render(<App />)
      await waitDiscover()
      // On Discover the persistent map shows everything ("Near you").
      expect(container.querySelector('.a-mapbar .a-h2').textContent).toBe('Near you')
      clickNav('Following')
      // On Following the map heading flips to the feed-scoped label.
      await waitFor(() => expect(container.querySelector('.a-mapbar .a-h2').textContent).toBe('Your feed'))
    })

    it('mobile Map tab inherits the Following scope and the toggle can override it', async () => {
      const { container } = render(<App />)
      await waitDiscover()
      clickNav('Following')      // sets map scope to 'following'
      clickNav('Map')            // mobile Map tab inherits that scope
      await waitFor(() => expect(container.querySelector('.a-mapscope')).toBeTruthy())
      expect(container.querySelector('.a-mapscope .on').textContent).toBe('Following')
      // The toggle lets the user switch back to all events.
      fireEvent.click(screen.getByText('All'))
      await waitFor(() => expect(container.querySelector('.a-mapscope .on').textContent).toBe('All'))
    })

    it('does NOT show the empty-feed message when a favorited calendar has mappable events', async () => {
      const { container } = render(<App />)
      await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
      // Follow Neumos (cal1) — its event "Jazz Night" has lat/lng.
      fireEvent.click(container.querySelector('.pill-follow'))
      clickNav('Following')
      await waitFor(() => expect(screen.getByText('1 calendars')).toBeInTheDocument())
      // The persistent desktop map is feed-scoped on Following; since the feed has
      // a coord-bearing event, the empty-feed overlay must NOT be shown.
      await waitFor(() => expect(container.querySelector('[data-testid="events-map"]')).toBeTruthy())
      expect(container.textContent).not.toContain('No favorited events with a location to show')
    })
})

  describe('deep linking', () => {
    it('cold-loads directly into a section from the hash', async () => {
      window.location.hash = '#section=you'
      render(<App />)
      await waitFor(() => expect(screen.getByText('Saved searches')).toBeInTheDocument())
    })

    it('cold-loads a channel detail from the hash once data lands', async () => {
      window.location.hash = '#channel=test-ripper-cal1.ics'
      render(<App />)
      await waitFor(() => expect(screen.getByText('Add to my calendar app')).toBeInTheDocument())
    })

    it('cold-loads an event detail from the hash', async () => {
      const event = mockEvents[0]
      window.location.hash = '#event=' + encodeURIComponent(`${event.summary}|${event.date}`)
      render(<App />)
      // EventDetail renders the summary in the hero and an icon-only share button.
      await waitFor(() => expect(screen.getByTitle('Copy link to this event')).toBeInTheDocument())
      expect(screen.getByText('Jazz Night')).toBeInTheDocument()
    })

    it('falls back to the section view when a deep-linked id is stale', async () => {
      window.location.hash = '#channel=does-not-exist.ics'
      render(<App />)
      // Resolves to the default Discover view rather than an empty overlay.
      await waitDiscover()
    })

    it('writes the section to the hash when navigating', async () => {
      render(<App />)
      await waitDiscover()
      clickNav('Following')
      await waitFor(() => expect(window.location.hash).toContain('section=following'))
    })

    it('updates the hash when a channel is opened', async () => {
      render(<App />)
      await waitDiscover()
      fireEvent.click(screen.getByText('Neumos'))
      await waitFor(() => expect(window.location.hash).toContain('channel=test-ripper-cal1.ics'))
    })
  })

  describe('desktop map resize', () => {
    const getApp = (container) => container.querySelector('.app206')

    it('renders a draggable divider on the desktop map panel', async () => {
      const { container } = render(<App />)
      await waitDiscover()
      const handle = container.querySelector('.a-mappanel .a-mapresize')
      expect(handle).toBeTruthy()
      expect(handle.getAttribute('role')).toBe('separator')
    })

    it('dragging the divider sets and persists the map column width', async () => {
      const { container } = render(<App />)
      await waitDiscover()
      Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
      const handle = container.querySelector('.a-mapresize')
      fireEvent.pointerDown(handle, { button: 0, clientX: 1100 })
      // Pointer at x=900 → map width = 1600 - 900 = 700px.
      fireEvent.pointerMove(window, { clientX: 900 })
      fireEvent.pointerUp(window)
      await waitFor(() => expect(getApp(container).style.getPropertyValue('--a-map-w')).toBe('700px'))
      expect(localStorage.getItem('map-panel-width')).toBe('700')
    })

    it('clamps the map width so the content column cannot collapse', async () => {
      const { container } = render(<App />)
      await waitDiscover()
      Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
      const handle = container.querySelector('.a-mapresize')
      fireEvent.pointerDown(handle, { button: 0, clientX: 1100 })
      // Pointer way past the left edge → huge requested width, clamped to
      // innerWidth - rail(84) - minContent(420) = 1096.
      fireEvent.pointerMove(window, { clientX: 50 })
      fireEvent.pointerUp(window)
      await waitFor(() => expect(getApp(container).style.getPropertyValue('--a-map-w')).toBe('1096px'))
    })

    it('double-clicking the divider resets to the default width', async () => {
      localStorage.setItem('map-panel-width', '700')
      const { container } = render(<App />)
      await waitDiscover()
      expect(getApp(container).style.getPropertyValue('--a-map-w')).toBe('700px')
      fireEvent.doubleClick(container.querySelector('.a-mapresize'))
      await waitFor(() => expect(getApp(container).style.getPropertyValue('--a-map-w')).toBe(''))
      expect(localStorage.getItem('map-panel-width')).toBe(null)
    })
  })
})

// Local UAT/demo mode (?uat=1): fakes a signed-in session, lists live in
// localStorage, no network. Lets the multi-list UI be previewed on a static
// deploy that has no OAuth backend.
describe('Local UAT mode (?uat=1)', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
    window.history.replaceState({}, '', '/?uat=1')
    global.fetch = vi.fn(mockFetch)
  })
  afterEach(() => { window.history.replaceState({}, '', '/') })

  it('boots a fake signed-in session with a default list and never calls the API', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('You')[0].closest('button'))
    await waitFor(() => expect(screen.getByText('UAT Tester')).toBeInTheDocument())
    expect(screen.getByText(/Local UAT mode/)).toBeInTheDocument()
    expect(screen.getByText('New list')).toBeInTheDocument()
    // No auth/me, /lists, or /favorites calls were made.
    const calls = global.fetch.mock.calls.map(c => String(c[0]))
    expect(calls.some(u => /\/auth\/me|\/lists|\/favorites|\/search-filters|\/geo-filters/.test(u))).toBe(false)
  })

  it('creates a second list locally and persists it to localStorage', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('You')[0].closest('button'))
    await waitFor(() => expect(screen.getByText('UAT Tester')).toBeInTheDocument())

    fireEvent.click(screen.getByText('New list'))
    const input = await screen.findByPlaceholderText(/List name/)
    fireEvent.change(input, { target: { value: 'Date Night' } })
    fireEvent.click(screen.getByText('Save'))

    // Switcher now shows both lists and persisted to localStorage.
    await waitFor(() => expect(container.querySelector('.a-listswitch')).toBeTruthy())
    expect(screen.getByRole('tab', { name: 'Date Night' })).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('calendar-ripper-uat-lists'))
    expect(stored.map(l => l.name)).toContain('Date Night')
  })
})

// Signed-in multi-list behavior. Auth is driven entirely by what the mocked
// fetch returns for `auth/me` + `/lists` (no real OAuth needed).
describe('Multiple favorites lists (signed-in)', () => {
  const API = 'http://api.test'
  const USER = { id: 'u1', name: 'Test User', email: 't@e.com', picture: '', feedToken: 'tok1', feedUrl: `${API}/feed/tok1.ics` }

  function signedInFetch(lists) {
    return (url, opts) => {
      const u = String(url)
      const method = (opts && opts.method) || 'GET'
      const json = (data) => Promise.resolve({ ok: true, json: async () => data, text: async () => '' })
      if (u.includes('/auth/me')) return json({ user: USER })
      if (u.endsWith('/lists') && method === 'GET') return json({ lists, updatedAt: '' })
      if (u.includes('/lists')) return json({ ok: true }) // PUT/POST/etc.
      if (u.includes('manifest.json')) return json(mockManifest)
      if (u.includes('events-index.json')) return json(mockEvents)
      if (u.includes('venues.json')) return json(mockVenues)
      if (u.includes('build-errors.json')) return json({ buildTime: '', totalErrors: 0, sources: [] })
      if (u.endsWith('.ics')) return Promise.resolve({ ok: true, text: async () => 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR' })
      return json({})
    }
  }

  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
    vi.stubEnv('VITE_FAVORITES_API_URL', API)
  })
  afterEach(() => { vi.unstubAllEnvs() })

  const list = (id, name, token, extra = {}) => ({
    id, name, feedUrl: `${API}/feed/${token}.ics`, icsUrls: [], searchFilters: [], geoFilters: [], ...extra,
  })

  const gotoYou = async () => {
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('You')[0].closest('button'))
    await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument())
  }

  it('shows no list switcher with a single list but offers "New list"', async () => {
    global.fetch = vi.fn(signedInFetch([list('default', 'My Favorites', 'tok1')]))
    const { container } = render(<App />)
    await gotoYou()
    expect(screen.getByText('Saved searches')).toBeInTheDocument()
    expect(container.querySelector('.a-listswitch')).toBeFalsy()
    expect(screen.getByText('New list')).toBeInTheDocument()
  })

  it('shows a list switcher with >1 list and switches the active feed URL', async () => {
    global.fetch = vi.fn(signedInFetch([
      list('default', 'My Favorites', 'tok1'),
      list('date-night', 'Date Night', 'tok2'),
    ]))
    const { container } = render(<App />)
    await gotoYou()
    await waitFor(() => expect(container.querySelector('.a-listswitch')).toBeTruthy())

    // Both list tabs render.
    expect(screen.getByRole('tab', { name: 'My Favorites' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Date Night' })).toBeInTheDocument()

    // Default list's feed URL is shown.
    expect(screen.getByText(`${API}/feed/tok1.ics`)).toBeInTheDocument()

    // Switching to the second list swaps the feed-URL card.
    fireEvent.click(screen.getByRole('tab', { name: 'Date Night' }))
    await waitFor(() => expect(screen.getByText(`${API}/feed/tok2.ics`)).toBeInTheDocument())
    expect(screen.getByText('Feed for “Date Night”')).toBeInTheDocument()
  })

  it('following a calendar targets the active list', async () => {
    global.fetch = vi.fn(signedInFetch([
      list('default', 'My Favorites', 'tok1'),
      list('date-night', 'Date Night', 'tok2'),
    ]))
    const { container } = render(<App />)
    await gotoYou()

    // Switch active list to Date Night, then follow a calendar from Discover.
    await waitFor(() => expect(container.querySelector('.a-listswitch')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Date Night' }))

    fireEvent.click(screen.getAllByText('Discover')[0].closest('button'))
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    fireEvent.click(container.querySelector('.pill-follow'))

    // The POST went to the active (date-night) list's favorites endpoint.
    await waitFor(() => {
      const calls = global.fetch.mock.calls.map(c => String(c[0]))
      expect(calls.some(u => u.includes('/lists/date-night/favorites/'))).toBe(true)
    })
  })

  it('shows the top-bar "Saving to" switcher only with >1 list', async () => {
    // Single list → no switcher.
    global.fetch = vi.fn(signedInFetch([list('default', 'My Favorites', 'tok1')]))
    const single = render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    await waitFor(() => {
      const calls = global.fetch.mock.calls.map(c => String(c[0]))
      expect(calls.some(u => u.endsWith('/lists'))).toBe(true)
    })
    expect(single.container.querySelector('.a-savingto')).toBeFalsy()
    single.unmount()

    // Two lists → switcher visible on Discover (no navigation needed).
    global.fetch = vi.fn(signedInFetch([
      list('default', 'My Favorites', 'tok1'),
      list('date-night', 'Date Night', 'tok2'),
    ]))
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.a-savingto')).toBeTruthy())
    expect(screen.getByText('Saving to:')).toBeInTheDocument()
    expect(container.querySelector('.a-savingto .a-savingto-name').textContent).toBe('My Favorites')
  })

  it('switching the top-bar switcher retargets follows and the toast names the list', async () => {
    global.fetch = vi.fn(signedInFetch([
      list('default', 'My Favorites', 'tok1'),
      list('date-night', 'Date Night', 'tok2'),
    ]))
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getByText('Neumos')).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('.a-savingto')).toBeTruthy())

    // Open the switcher and pick Date Night — all without leaving Discover.
    fireEvent.click(container.querySelector('.a-savingto .a-dd-btn'))
    fireEvent.click(screen.getByRole('option', { name: /Date Night/ }))
    await waitFor(() => expect(container.querySelector('.a-savingto .a-savingto-name').textContent).toBe('Date Night'))

    // Follow a card → POST targets date-night and the toast names the list.
    fireEvent.click(container.querySelector('.pill-follow'))
    await waitFor(() => expect(screen.getByText(/Added .* to Date Night/)).toBeInTheDocument())
    const calls = global.fetch.mock.calls.map(c => String(c[0]))
    expect(calls.some(u => u.includes('/lists/date-night/favorites/'))).toBe(true)
  })
})
