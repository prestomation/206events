import React, { useState, useCallback } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App206Context } from './context.js'
import { BannerImage, EventThumb, Lightbox } from './atoms.jsx'

// Minimal host that wires the lightbox handlers the way App206 does, so we can
// exercise BannerImage/EventThumb → openLightbox → Lightbox end to end.
function Host({ children }) {
  const [lightbox, setLightbox] = useState(null)
  const openLightbox = useCallback((src, alt) => { if (src) setLightbox({ src, alt: alt || '' }) }, [])
  const closeLightbox = useCallback(() => setLightbox(null), [])
  return (
    <App206Context.Provider value={{ lightbox, openLightbox, closeLightbox }}>
      {children}
      <Lightbox />
    </App206Context.Provider>
  )
}

describe('BannerImage', () => {
  it('renders a blurred backdrop + contained foreground from one src', () => {
    const { container } = render(<Host><BannerImage src="https://x/logo.png" alt="Photo of Ballard Brood" /></Host>)
    const bg = container.querySelector('.a-banner-bg')
    const fg = container.querySelector('.a-banner-fg')
    expect(bg).toBeTruthy()
    expect(fg).toBeTruthy()
    expect(bg.getAttribute('src')).toBe('https://x/logo.png')
    expect(fg.getAttribute('src')).toBe('https://x/logo.png')
    // Backdrop is decorative; only the foreground carries the alt text.
    expect(bg.getAttribute('aria-hidden')).toBe('true')
    expect(fg.getAttribute('alt')).toBe('Photo of Ballard Brood')
  })

  it('renders nothing when src is missing', () => {
    const { container } = render(<Host><BannerImage src={null} alt="x" /></Host>)
    expect(container.querySelector('.a-banner')).toBeNull()
  })

  it('opens the lightbox with the full image when clicked', () => {
    render(<Host><BannerImage src="https://x/poster.jpg" alt="Photo for Show" /></Host>)
    expect(document.querySelector('.a-lightbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /view full image/i }))
    const box = document.querySelector('.a-lightbox')
    expect(box).toBeTruthy()
    expect(box.querySelector('img').getAttribute('src')).toBe('https://x/poster.jpg')
  })
})

describe('EventThumb', () => {
  it('opens the lightbox when the thumbnail is clicked', () => {
    const { container } = render(<Host><EventThumb src="https://x/flyer.jpg" alt="Photo for Gig" /></Host>)
    fireEvent.click(container.querySelector('.a-evthumb'))
    expect(document.querySelector('.a-lightbox img').getAttribute('src')).toBe('https://x/flyer.jpg')
  })

  it('renders nothing when src is missing', () => {
    const { container } = render(<Host><EventThumb src={undefined} alt="x" /></Host>)
    expect(container.querySelector('.a-evthumb')).toBeNull()
  })
})

describe('Lightbox', () => {
  it('closes on backdrop click but not when the image itself is clicked', () => {
    render(<Host><BannerImage src="https://x/a.jpg" alt="A" /></Host>)
    fireEvent.click(screen.getByRole('button', { name: /view full image/i }))
    const box = document.querySelector('.a-lightbox')
    // Clicking the image must not bubble up to close the viewer.
    fireEvent.click(box.querySelector('img'))
    expect(document.querySelector('.a-lightbox')).toBeTruthy()
    // Clicking the backdrop closes it.
    fireEvent.click(box)
    expect(document.querySelector('.a-lightbox')).toBeNull()
  })

  it('closes on Escape', () => {
    render(<Host><BannerImage src="https://x/a.jpg" alt="A" /></Host>)
    fireEvent.click(screen.getByRole('button', { name: /view full image/i }))
    expect(document.querySelector('.a-lightbox')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.a-lightbox')).toBeNull()
  })

  it('closes via the close button', () => {
    render(<Host><BannerImage src="https://x/a.jpg" alt="A" /></Host>)
    fireEvent.click(screen.getByRole('button', { name: /view full image/i }))
    fireEvent.click(screen.getByRole('button', { name: /close image/i }))
    expect(document.querySelector('.a-lightbox')).toBeNull()
  })
})
