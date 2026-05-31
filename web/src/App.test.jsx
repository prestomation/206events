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
const mockVenues = [{
  name: 'neumos', friendlyName: 'Neumos', tags: ['Music', 'Capitol Hill'], kind: 'ripper',
  geo: { lat: 47.61, lng: -122.32, label: 'Capitol Hill' },
  calendars: [{ name: 'cal1', friendlyName: 'Neumos', links: { ics: { href: 'test-ripper-cal1.ics' } } }],
}]

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

  it('renders the Discover view with channels', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('BROWSE BY')).toBeInTheDocument())
    expect(screen.getByText('Neumos')).toBeInTheDocument()
    expect(screen.getByText('SIFF')).toBeInTheDocument()
  })

  it('surfaces category chips derived from real tags', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('BROWSE BY')).toBeInTheDocument())
    // "Music" and "Movies" are activity tags → become category chips
    expect(screen.getAllByText('Music').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Movies').length).toBeGreaterThan(0)
  })

  it('switches Discover to Events mode and lists events by day', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('BROWSE BY')).toBeInTheDocument())
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

  it('navigates to Following and shows the empty feed prompt', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('BROWSE BY')).toBeInTheDocument())
    clickNav('Following')
    await waitFor(() => expect(screen.getByText('Your feed is empty')).toBeInTheDocument())
  })

  it('navigates to You and shows the source sections', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('BROWSE BY')).toBeInTheDocument())
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

  it('opens the search overlay from the top bar', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('BROWSE BY')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Search events & venues…').closest('button'))
    await waitFor(() => expect(screen.getByPlaceholderText('Search events, venues, neighborhoods…')).toBeInTheDocument())
  })
})
