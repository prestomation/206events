import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventDateList, MAX_GROUP_DATES } from './EventDateList.jsx'

const inst = (day, over = {}) => ({
  date: `2026-07-${String(day).padStart(2, '0')}T19:00:00[America/Los_Angeles]`,
  url: `https://example.com/${day}`,
  ...over,
})

const rows = (c) => c.querySelectorAll('.mp-daterow')
const links = (c) => c.querySelectorAll('a.mp-daterow-go')

describe('EventDateList (rows)', () => {
  it('renders one row per instance', () => {
    const { container } = render(<EventDateList instances={[inst(1), inst(2), inst(3)]} />)
    expect(rows(container)).toHaveLength(3)
  })

  it('links each row that carries its own event page, in order', () => {
    const { container } = render(<EventDateList instances={[inst(1), inst(2), inst(3)]} />)
    expect([...links(container)].map((a) => a.getAttribute('href')))
      .toEqual(['https://example.com/1', 'https://example.com/2', 'https://example.com/3'])
  })

  it('only links http(s) urls — javascript: and missing urls get no link', () => {
    const { container } = render(<EventDateList instances={[
      inst(1, { url: 'https://example.com/ok' }),
      inst(2, { url: 'javascript:alert(1)' }), // eslint-disable-line no-script-url
      inst(3, { url: undefined }),
    ]} />)
    expect(rows(container)).toHaveLength(3)
    expect(links(container)).toHaveLength(1)
    expect(links(container)[0].getAttribute('href')).toBe('https://example.com/ok')
  })

  it('inserts a month divider when the month changes', () => {
    const { container } = render(<EventDateList instances={[
      { date: '2026-07-30T19:00:00[America/Los_Angeles]' },
      { date: '2026-08-01T19:00:00[America/Los_Angeles]' },
    ]} />)
    expect([...container.querySelectorAll('.mp-month')].map((e) => e.textContent))
      .toEqual(['July 2026', 'August 2026'])
  })

  it('can suppress month dividers for a short peek list', () => {
    const { container } = render(<EventDateList showMonths={false} instances={[
      { date: '2026-07-30T19:00:00[America/Los_Angeles]' },
      { date: '2026-08-01T19:00:00[America/Los_Angeles]' },
    ]} />)
    expect(container.querySelectorAll('.mp-month')).toHaveLength(0)
  })

  it('caps at MAX_GROUP_DATES and summarises the overflow', () => {
    const many = Array.from({ length: MAX_GROUP_DATES + 7 }, (_, i) => inst((i % 28) + 1, { url: `https://example.com/${i}` }))
    const { container } = render(<EventDateList instances={many} />)
    expect(rows(container)).toHaveLength(MAX_GROUP_DATES)
    expect(screen.getByText('+7 more dates')).toBeInTheDocument()
  })

  it('honours a smaller cap for a peek list', () => {
    const { container } = render(<EventDateList instances={[inst(1), inst(2), inst(3), inst(4)]} max={2} />)
    expect(rows(container)).toHaveLength(2)
    expect(screen.getByText('+2 more dates')).toBeInTheDocument()
  })

  it('marks the first instance selected by default and follows `value`', () => {
    const list = [inst(1), inst(2)]
    const a = render(<EventDateList instances={list} />)
    expect(a.container.querySelectorAll('.mp-daterow--on')).toHaveLength(1)
    expect(a.container.querySelector('.mp-daterow--on')).toHaveTextContent('Jul 1')

    const b = render(<EventDateList instances={list} value={list[1].date} />)
    expect(b.container.querySelector('.mp-daterow--on')).toHaveTextContent('Jul 2')
  })

  it('picking a row is a SELECTION, not navigation', () => {
    const onPick = vi.fn()
    const { container } = render(<EventDateList instances={[inst(1), inst(2)]} onPick={onPick} />)
    fireEvent.click(container.querySelectorAll('.mp-daterow-pick')[1])
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].date).toContain('2026-07-02')
  })

  it('renders nothing but an empty list for no instances', () => {
    const { container } = render(<EventDateList instances={[]} />)
    expect(rows(container)).toHaveLength(0)
  })
})

describe('EventDateList (chips)', () => {
  it('renders one chip per instance with weekday over date', () => {
    const { container } = render(<EventDateList variant="chips" instances={[inst(1), inst(2)]} />)
    const chips = container.querySelectorAll('.mp-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].querySelector('.mp-chip-day')).toHaveTextContent('Jul 1')
    expect(chips[0].querySelector('.mp-chip-dow').textContent).toMatch(/^[A-Z][a-z]{2}$/)
  })

  it('marks the selected chip and reports picks', () => {
    const onPick = vi.fn()
    const list = [inst(1), inst(2)]
    const { container } = render(
      <EventDateList variant="chips" instances={list} value={list[1].date} onPick={onPick} />,
    )
    expect(container.querySelector('.mp-chip--on')).toHaveTextContent('Jul 2')
    fireEvent.click(container.querySelectorAll('.mp-chip')[0])
    expect(onPick.mock.calls[0][0].date).toContain('2026-07-01')
  })

  it('summarises overflow compactly', () => {
    const { container } = render(<EventDateList variant="chips" instances={[inst(1), inst(2), inst(3)]} max={1} />)
    expect(container.querySelectorAll('.mp-chip')).toHaveLength(1)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })
})
