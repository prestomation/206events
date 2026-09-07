import { describe, it, expect } from 'vitest'
import { cachedDateTimeFormat, eventDateParts, localDayIndex } from './dateFormat.js'

describe('cachedDateTimeFormat', () => {
  it('returns the same instance for the same locale and options', () => {
    const a = cachedDateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' })
    const b = cachedDateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' })
    expect(a).toBe(b)
  })

  it('returns distinct instances for different options', () => {
    const a = cachedDateTimeFormat('en-US', { weekday: 'short' })
    const b = cachedDateTimeFormat('en-US', { weekday: 'long' })
    const c = cachedDateTimeFormat('en-CA', { weekday: 'short' })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('matches toLocaleDateString output for explicit components', () => {
    const d = new Date(2026, 6, 3, 19, 30)
    const opts = { weekday: 'short', month: 'short', day: 'numeric' }
    expect(cachedDateTimeFormat('en-US', opts).format(d)).toBe(d.toLocaleDateString('en-US', opts))
  })

  it('matches the bare en-CA YYYY-MM-DD default used by localDay', () => {
    const d = new Date(Date.UTC(2026, 6, 4, 3, 0)) // 2026-07-03T20:00 in LA
    const tz = { timeZone: 'America/Los_Angeles' }
    expect(cachedDateTimeFormat('en-CA', tz).format(d)).toBe(d.toLocaleDateString('en-CA', tz))
  })

  it('matches toLocaleTimeString output for hour/minute options', () => {
    const d = new Date(2026, 6, 3, 19, 30)
    const opts = { hour: 'numeric', minute: '2-digit' }
    expect(cachedDateTimeFormat('en-US', opts).format(d)).toBe(d.toLocaleTimeString('en-US', opts))
  })
})

describe('eventDateParts', () => {
  const D = '2026-07-03T19:30:00-07:00[America/Los_Angeles]'

  it('splits a js-joda string with its IANA bracket into display parts', () => {
    const p = eventDateParts(D)
    const d = new Date('2026-07-03T19:30:00-07:00')
    expect(p.dow).toBe(d.toLocaleDateString('en-US', { weekday: 'short' }))
    expect(p.dowLong).toBe(d.toLocaleDateString('en-US', { weekday: 'long' }))
    expect(p.day).toBe(d.toLocaleDateString('en-US', { day: 'numeric' }))
    expect(p.dayMonth).toBe(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    expect(p.time).toBe(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
    expect(p.monthLabel).toBe(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
  })

  it('returns null for an unparseable string', () => {
    expect(eventDateParts('nope')).toBeNull()
    expect(eventDateParts(undefined)).toBeNull()
  })

  it('gives a whole-day index that differences to exact day gaps across DST', () => {
    const a = eventDateParts('2026-10-29T19:00:00-07:00[America/Los_Angeles]')
    const b = eventDateParts('2026-11-05T19:00:00-08:00[America/Los_Angeles]')
    expect(b.dayIndex - a.dayIndex).toBe(7)
  })

  it('agrees with localDayIndex for the same calendar day', () => {
    const p = eventDateParts(D)
    expect(p.dayIndex).toBe(localDayIndex(p.date))
  })
})
