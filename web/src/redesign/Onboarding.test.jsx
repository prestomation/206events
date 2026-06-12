import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App206Context } from './context.js'
import { WelcomeModal, HelpModal, isCleanColdLoad } from './Onboarding.jsx'
import cityConfig from '../../../city.config.ts'

// Render a modal inside a context provider with an overridable model.
function renderWithModel(ui, model = {}) {
  return render(<App206Context.Provider value={model}>{ui}</App206Context.Provider>)
}

describe('isCleanColdLoad', () => {
  const base = { section: 'discover', channel: null, event: null, q: '', category: null, neighborhood: null }

  it('is true for a plain Discover entry', () => {
    expect(isCleanColdLoad(base)).toBe(true)
  })

  it('is false when deep-linking into a channel or event', () => {
    expect(isCleanColdLoad({ ...base, channel: 'some.ics' })).toBe(false)
    expect(isCleanColdLoad({ ...base, event: 'evt-key' })).toBe(false)
  })

  it('is false on another section or a pre-applied search/filter', () => {
    expect(isCleanColdLoad({ ...base, section: 'following' })).toBe(false)
    expect(isCleanColdLoad({ ...base, q: 'jazz' })).toBe(false)
    expect(isCleanColdLoad({ ...base, category: 'Music' })).toBe(false)
    expect(isCleanColdLoad({ ...base, neighborhood: 'Ballard' })).toBe(false)
  })
})

describe('WelcomeModal', () => {
  it('renders only when showWelcome is set', () => {
    const { rerender } = renderWithModel(<WelcomeModal />, { showWelcome: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(
      <App206Context.Provider value={{ showWelcome: true, dismissWelcome: () => {}, openHelp: () => {} }}>
        <WelcomeModal />
      </App206Context.Provider>
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(`Every ${cityConfig.city.name} event, one place`)).toBeTruthy()
  })

  it('dismisses via "Start browsing"', () => {
    const dismissWelcome = vi.fn()
    renderWithModel(<WelcomeModal />, { showWelcome: true, dismissWelcome, openHelp: () => {} })
    fireEvent.click(screen.getByText(/Start browsing/i))
    expect(dismissWelcome).toHaveBeenCalledTimes(1)
  })

  it('"How it works" dismisses the welcome and opens help', () => {
    const dismissWelcome = vi.fn()
    const openHelp = vi.fn()
    renderWithModel(<WelcomeModal />, { showWelcome: true, dismissWelcome, openHelp })
    fireEvent.click(screen.getByText(/How it works/i))
    expect(dismissWelcome).toHaveBeenCalledTimes(1)
    expect(openHelp).toHaveBeenCalledTimes(1)
  })
})

describe('HelpModal', () => {
  it('renders only when helpOpen is set', () => {
    renderWithModel(<HelpModal />, { helpOpen: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes via the close button, Escape, and the backdrop', () => {
    // Close button
    let closeHelp = vi.fn()
    const r1 = renderWithModel(<HelpModal />, { helpOpen: true, closeHelp })
    fireEvent.click(screen.getByLabelText('Close'))
    expect(closeHelp).toHaveBeenCalledTimes(1)
    r1.unmount()

    // Escape key
    closeHelp = vi.fn()
    const r2 = renderWithModel(<HelpModal />, { helpOpen: true, closeHelp })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closeHelp).toHaveBeenCalledTimes(1)
    r2.unmount()

    // Backdrop click
    closeHelp = vi.fn()
    renderWithModel(<HelpModal />, { helpOpen: true, closeHelp })
    fireEvent.click(document.querySelector('.a-dlg-backdrop'))
    expect(closeHelp).toHaveBeenCalledTimes(1)
  })
})
