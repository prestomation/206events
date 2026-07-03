import { describe, it, expect } from 'vitest'
import { cachedDateTimeFormat } from './dateFormat.js'

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
