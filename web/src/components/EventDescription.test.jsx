import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EventDescription, linkifyText } from './EventDescription.jsx'

describe('linkifyText', () => {
  it('leaves plain text without URLs unchanged', () => {
    expect(linkifyText('Just some text')).toEqual(['Just some text'])
  })

  it('turns a bare https URL into an icon-badge anchor with the host in its label', () => {
    const out = linkifyText('Tickets at https://example.com/show here')
    // [ 'Tickets at ', <a>, ' here' ]
    expect(out[0]).toBe('Tickets at ')
    expect(out[1].props.href).toBe('https://example.com/show')
    expect(out[1].props.target).toBe('_blank')
    expect(out[1].props.rel).toBe('noopener noreferrer')
    // The visible text is an icon, not the URL; the host lives in the label.
    expect(out[1].props.title).toBe('Open example.com')
    expect(out[1].props['aria-label']).toBe('Open example.com')
    expect(typeof out[1].props.children).not.toBe('string')
    expect(out[2]).toBe(' here')
  })

  it('prefixes www. links with https and strips www. from the host label', () => {
    const out = linkifyText('See www.example.com')
    expect(out[1].props.href).toBe('https://www.example.com')
    expect(out[1].props.title).toBe('Open example.com')
  })

  it('peels trailing sentence punctuation out of the link', () => {
    const out = linkifyText('Go to https://example.com.')
    expect(out[1].props.href).toBe('https://example.com')
    expect(out[2]).toBe('.')
  })

  it('stops at an angle bracket in either direction', () => {
    const out = linkifyText('link https://example.com>rest')
    expect(out[1].props.href).toBe('https://example.com')
    expect(out[2]).toBe('>rest')
  })

  it('handles multiple URLs', () => {
    const out = linkifyText('https://a.com and https://b.com')
    const hrefs = out.filter((n) => n && n.props).map((n) => n.props.href)
    expect(hrefs).toEqual(['https://a.com', 'https://b.com'])
  })
})

describe('EventDescription', () => {
  it('renders a clickable link from a bare URL in plain text', () => {
    const { container } = render(<EventDescription text="Info: https://example.com/e" />)
    const a = container.querySelector('a')
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toBe('https://example.com/e')
    expect(a.getAttribute('target')).toBe('_blank')
  })

  it('forces target/rel on anchors in HTML descriptions', () => {
    const { container } = render(
      <EventDescription text='<p>Buy <a href="https://example.com/t">tickets</a></p>' />
    )
    const a = container.querySelector('a')
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toBe('https://example.com/t')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('renders nothing for empty text', () => {
    const { container } = render(<EventDescription text="" />)
    expect(container.firstChild).toBeNull()
  })
})
