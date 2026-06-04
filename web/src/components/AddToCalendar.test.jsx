import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AddToCalendar } from './AddToCalendar.jsx'

const baseEvent = {
  title: 'Test Event',
  startDate: new Date('2026-06-15T19:00:00Z'),
  endDate: new Date('2026-06-15T21:00:00Z'),
  description: 'A test',
  location: 'Seattle, WA',
  url: 'https://example.com/event',
}

describe('AddToCalendar', () => {
  it('renders a Google Calendar link when mode="google"', () => {
    const { container } = render(<AddToCalendar {...baseEvent} mode="google" />)
    const a = container.querySelector('a.add-to-cal-btn')
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toContain('calendar.google.com/calendar/render')
    expect(a.getAttribute('target')).toBe('_blank')
  })

  it('renders a download button when mode="ics"', () => {
    const { container } = render(<AddToCalendar {...baseEvent} mode="ics" />)
    expect(container.querySelector('button.add-to-cal-btn')).toBeTruthy()
    expect(container.querySelector('a.add-to-cal-btn')).toBeNull()
  })

  it('renders nothing without a start date', () => {
    const { container } = render(<AddToCalendar {...baseEvent} startDate={undefined} mode="ics" />)
    expect(container.firstChild).toBeNull()
  })
})
