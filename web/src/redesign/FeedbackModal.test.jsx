import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App206Context } from './context.js'
import { FeedbackModal } from './FeedbackModal.jsx'
import cityConfig from '../../../city.config.ts'

// Minimal app model the modal reads from context. Tests override fields per case.
function makeApp(overrides = {}) {
  return {
    API_URL: 'https://api.test',
    authUser: null,
    feedbackPrefill: { type: 'general' },
    openFeedback: vi.fn(),
    closeFeedback: vi.fn(),
    flash: vi.fn(),
    ...overrides,
  }
}

function renderModal(app) {
  return render(
    <App206Context.Provider value={app}>
      <FeedbackModal />
    </App206Context.Provider>
  )
}

describe('FeedbackModal', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders nothing when no prefill is set', () => {
    const app = makeApp({ feedbackPrefill: null })
    const { container } = renderModal(app)
    expect(container.firstChild).toBeNull()
  })

  it('renders a hidden, non-tabbable honeypot field', () => {
    const app = makeApp()
    const { container } = renderModal(app)
    const hp = container.querySelector('input.a-hp')
    expect(hp).toBeTruthy()
    expect(hp.getAttribute('tabindex')).toBe('-1')
    expect(hp.getAttribute('aria-hidden')).toBe('true')
  })

  it('preselects the type from the prefill (source)', () => {
    const app = makeApp({ feedbackPrefill: { type: 'source' } })
    renderModal(app)
    expect(screen.getByRole('button', { name: 'Suggest a source' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the source context when launched from a channel', () => {
    const app = makeApp({ feedbackPrefill: { type: 'bug', context: { sourceName: 'Stoup Brewing' } } })
    renderModal(app)
    expect(screen.getByText('Stoup Brewing')).toBeInTheDocument()
  })

  it('pre-fills the email for signed-in users', () => {
    const app = makeApp({ authUser: { email: 'me@example.com' } })
    renderModal(app)
    expect(screen.getByPlaceholderText(/Email/i)).toHaveValue('me@example.com')
  })

  it('does not submit an empty message', () => {
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const app = makeApp()
    renderModal(app)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(fetchFn).not.toHaveBeenCalled()
    expect(screen.getByText(/Please enter a message/i)).toBeInTheDocument()
  })

  it('POSTs the expected payload with credentials and flashes on success', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchFn)
    const app = makeApp({ feedbackPrefill: { type: 'bug', context: { sourceName: 'Stoup', icsUrl: 'stoup.ics' } } })
    renderModal(app)

    fireEvent.change(screen.getByPlaceholderText(/What’s wrong/i), { target: { value: 'Missing events' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.test/feedback')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    const payload = JSON.parse(init.body)
    expect(payload).toMatchObject({
      type: 'bug',
      message: 'Missing events',
      website: '',
      context: { sourceName: 'Stoup', icsUrl: 'stoup.ics' },
    })
    await waitFor(() => expect(app.flash).toHaveBeenCalled())
    expect(app.closeFeedback).toHaveBeenCalled()
  })

  it('shows an error and stays open when the request fails', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }))
    vi.stubGlobal('fetch', fetchFn)
    const app = makeApp()
    renderModal(app)
    fireEvent.change(screen.getByPlaceholderText(/love/i), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument())
    expect(app.closeFeedback).not.toHaveBeenCalled()
  })

  it('falls back to GitHub issues when no API_URL is configured', () => {
    const openFn = vi.fn()
    vi.stubGlobal('open', openFn)
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const app = makeApp({ API_URL: '' })
    renderModal(app)
    fireEvent.change(screen.getByPlaceholderText(/love/i), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(fetchFn).not.toHaveBeenCalled()
    expect(openFn).toHaveBeenCalledWith(expect.stringContaining(`github.com/${cityConfig.site.repo}/issues/new`), '_blank', 'noopener,noreferrer')
    expect(app.closeFeedback).toHaveBeenCalled()
  })
})
