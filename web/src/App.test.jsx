import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    await waitFor(() => expect(screen.getByText('Your feed is empty')).toBeInTheDocument())
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
})
