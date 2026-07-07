import { describe, it, expect } from 'vitest'
import {
  weatherView,
  POP_DISPLAY_THRESHOLD,
  WEATHER_WARN_AFTER_HOURS,
  WEATHER_HIDE_AFTER_HOURS,
} from './weatherModel.js'

const HOUR_MS = 3_600_000
const NOW = Date.parse('2026-07-07T12:00:00Z')

const freshAsOf = (agoHours = 1) => new Date(NOW - agoHours * HOUR_MS).toISOString()

const event = (weather) => ({ icsUrl: 'recurring-x.ics', summary: 'X', date: '2026-07-08T18:00:00Z', weather })

describe('weatherView', () => {
  it('returns null without a weather field or with a malformed one', () => {
    expect(weatherView({ summary: 'X' }, NOW)).toBeNull()
    expect(weatherView(event({ hi: 'warm', code: 0, asOf: freshAsOf() }), NOW)).toBeNull()
    expect(weatherView(event({ hi: 70, lo: 60, pop: 0, code: 0, asOf: 'garbage', conf: 'high' }), NOW)).toBeNull()
  })

  it('renders a sunny high-confidence badge with temp only under the PoP threshold', () => {
    const v = weatherView(event({ hi: 74.4, lo: 61, pop: POP_DISPLAY_THRESHOLD - 1, code: 0, asOf: freshAsOf(), conf: 'high' }), NOW)
    expect(v.emoji).toBe('☀️')
    expect(v.badgeText).toBe('74°')
    expect(v.conf).toBe('high')
    expect(v.explanation).toContain('Open-Meteo')
    expect(v.explanation).toContain('61–74°')
  })

  it('shows the precipitation percentage at/above the threshold', () => {
    const v = weatherView(event({ hi: 55, lo: 50, pop: 60, code: 61, asOf: freshAsOf(), conf: 'high' }), NOW)
    expect(v.badgeText).toBe('55° · 60% rain')
    expect(v.emoji).toBe('🌧️')
  })

  it('tempers low confidence: rain worded as a possibility, note in the popup', () => {
    const v = weatherView(event({ hi: 55, lo: 50, pop: 60, code: 61, asOf: freshAsOf(), conf: 'low' }), NOW)
    expect(v.badgeText).toBe('55° · rain possible')
    expect(v.explanation).toContain('low confidence')
  })

  it('notes the medium tier in the popup', () => {
    const v = weatherView(event({ hi: 70, lo: 60, pop: 0, code: 1, asOf: freshAsOf(), conf: 'medium' }), NOW)
    expect(v.explanation).toContain('check closer to the date')
  })

  it('warns when the forecast is aging and hides it entirely when too old', () => {
    const aging = weatherView(event({ hi: 70, lo: 60, pop: 0, code: 0, asOf: freshAsOf(WEATHER_WARN_AFTER_HOURS + 1), conf: 'high' }), NOW)
    expect(aging.explanation).toContain('may be outdated')

    const dead = weatherView(event({ hi: 70, lo: 60, pop: 0, code: 0, asOf: freshAsOf(WEATHER_HIDE_AFTER_HOURS + 1), conf: 'high' }), NOW)
    expect(dead).toBeNull()
  })

  it('maps notable WMO codes to distinct icons', () => {
    const iconFor = (code) => weatherView(event({ hi: 70, lo: 60, pop: 0, code, asOf: freshAsOf(), conf: 'high' }), NOW).emoji
    expect(iconFor(95)).toBe('⛈️')
    expect(iconFor(71)).toBe('❄️')
    expect(iconFor(80)).toBe('🌦️')
    expect(iconFor(45)).toBe('🌫️')
    expect(iconFor(3)).toBe('☁️')
    expect(iconFor(2)).toBe('⛅')
  })
})
