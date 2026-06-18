import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App206Context } from './context.js'
import { YouView } from './views.jsx'

// The account card + ICS-subscription card only make sense when a favorites
// backend is configured (VITE_FAVORITES_API_URL → app.API_URL). Template copies
// without it run read-only, so the sign-in prompt and the personal-feed card —
// whose only message would be a dead "Sign in…" — must not render. The e2e
// bundle bakes API_URL in at build time, so this gating is only reachable via a
// component render; these tests are the contract for it.

function makeApp(overrides = {}) {
  return {
    API_URL: 'https://api.test',
    uatMode: false,
    authUser: null,
    channels: [],
    favoritesSet: new Set(),
    geoFilters: [],
    searchFilters: [],
    lists: [],
    activeList: null,
    activeListId: 'default',
    calendarAddMode: 'auto',
    isMobile: false,
    setCalendarAddMode: vi.fn(),
    addSearchFilter: vi.fn(),
    removeSearchFilter: vi.fn(),
    addGeoFilter: vi.fn(),
    deleteGeoFilter: vi.fn(),
    editGeoFilter: vi.fn(),
    handleLogin: vi.fn(),
    handleLogout: vi.fn(),
    openFeedback: vi.fn(),
    go: vi.fn(),
    flash: vi.fn(),
    ...overrides,
  }
}

function renderYou(app) {
  return render(
    <App206Context.Provider value={app}>
      <YouView />
    </App206Context.Provider>
  )
}

describe('YouView login gating', () => {
  it('hides the account + ICS cards when no favorites backend is configured', () => {
    renderYou(makeApp({ API_URL: '' }))
    expect(screen.queryByText(/Sign in to sync sources across devices/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Not signed in')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign in/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/single subscription link/i)).not.toBeInTheDocument()
    // The rest of the page (local-only config) still renders.
    expect(screen.getByText('Add-to-calendar button')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send feedback/i })).toBeInTheDocument()
  })

  it('shows the sign-in prompt when a backend is configured and the user is logged out', () => {
    renderYou(makeApp({ API_URL: 'https://api.test', authUser: null }))
    expect(screen.getByText('Not signed in')).toBeInTheDocument()
    expect(screen.getByText(/Sign in to sync sources across devices/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument()
  })

  it('keeps the cards in UAT demo mode even without API_URL', () => {
    renderYou(makeApp({
      API_URL: '',
      uatMode: true,
      authUser: { name: 'UAT Tester', email: 'Demo session', picture: '' },
      activeList: { name: 'Demo', feedUrl: null },
    }))
    expect(screen.getByText('UAT Tester')).toBeInTheDocument()
    // ICS card heading renders (the demo placeholder copy lives inside it).
    expect(screen.getByText(/Demo mode/i)).toBeInTheDocument()
  })
})
