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

  it('falls back to a prefilled GitHub issue when no API_URL is configured', () => {
    const openFn = vi.fn()
    vi.stubGlobal('open', openFn)
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)
    const app = makeApp({ API_URL: '', feedbackPrefill: { type: 'bug', context: { sourceName: 'Stoup', icsUrl: 'stoup.ics' } } })
    renderModal(app)
    fireEvent.change(screen.getByPlaceholderText(/What’s wrong/i), { target: { value: 'Missing events' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(fetchFn).not.toHaveBeenCalled()
    expect(openFn).toHaveBeenCalledTimes(1)
    const [url, target, features] = openFn.mock.calls[0]
    expect(target).toBe('_blank')
    expect(features).toBe('noopener,noreferrer')

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(`https://github.com/${cityConfig.site.repo}/issues/new`)
    // Title mirrors the worker: [Bug] prefix + the source name as the hint.
    expect(parsed.searchParams.get('title')).toBe('[Bug] Stoup')
    expect(parsed.searchParams.get('labels')).toBe('feedback,bug')
    const body = parsed.searchParams.get('body')
    expect(body).toContain('**Type:** bug')
    expect(body).toContain('**Source:** Stoup')
    expect(body).toContain('**Calendar feed:** stoup.ics')
    expect(body).toContain('Missing events')
    expect(app.closeFeedback).toHaveBeenCalled()
  })

  it('falls back to GitHub when the worker reports feedback is not configured (503)', async () => {
    const openFn = vi.fn()
    vi.stubGlobal('open', openFn)
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503 }))
    vi.stubGlobal('fetch', fetchFn)
    const app = makeApp()
    renderModal(app)
    fireEvent.change(screen.getByPlaceholderText(/love/i), { target: { value: 'hello there' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(openFn).toHaveBeenCalledTimes(1))
    const parsed = new URL(openFn.mock.calls[0][0])
    expect(parsed.searchParams.get('body')).toContain('hello there')
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    expect(app.closeFeedback).toHaveBeenCalled()
  })

  it('copies the body and opens a short GitHub URL when the message is too long', () => {
    const openFn = vi.fn()
    vi.stubGlobal('open', openFn)
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const app = makeApp({ API_URL: '' })
    renderModal(app)
    // '#' percent-encodes to %23 (3 chars each), so 4000 of them blow the
    // encoded URL well past MAX_ISSUE_URL_LENGTH (6000).
    const huge = '#'.repeat(4000)
    fireEvent.change(screen.getByPlaceholderText(/love/i), { target: { value: huge } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('#'.repeat(100))
    const parsed = new URL(openFn.mock.calls[0][0])
    expect(parsed.searchParams.get('body')).toBe('_Paste your copied feedback here._')
    expect(app.flash).toHaveBeenCalledWith(expect.stringContaining('copied'))
  })
})
