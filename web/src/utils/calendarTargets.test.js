import { describe, it, expect } from 'vitest'
import {
  CALENDAR_TARGETS,
  CALENDAR_MODE_OPTIONS,
  DEFAULT_CALENDAR_MODE,
  resolveCalendarMode,
} from './calendarTargets.js'

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

describe('resolveCalendarMode', () => {
  it('passes explicit provider ids through unchanged', () => {
    expect(resolveCalendarMode('google', DESKTOP_UA)).toBe('google')
    expect(resolveCalendarMode('ics', ANDROID_UA)).toBe('ics')
  })

  it('auto → google on Android (mobile)', () => {
    expect(resolveCalendarMode('auto', ANDROID_UA)).toBe('google')
  })

  it('auto → ics on desktop', () => {
    // jsdom default navigator is not iOS, so a non-Android UA resolves to ics.
    expect(resolveCalendarMode('auto', DESKTOP_UA)).toBe('ics')
  })

  it('unknown/empty mode falls back to the auto heuristic', () => {
    expect(resolveCalendarMode(undefined, ANDROID_UA)).toBe('google')
    expect(resolveCalendarMode('bogus', DESKTOP_UA)).toBe('ics')
  })
})

describe('calendar target registry', () => {
  it('google is a link target, ics is a download target', () => {
    expect(CALENDAR_TARGETS.google.kind).toBe('link')
    expect(typeof CALENDAR_TARGETS.google.href).toBe('function')
    expect(CALENDAR_TARGETS.ics.kind).toBe('download')
  })

  it('default mode is auto', () => {
    expect(DEFAULT_CALENDAR_MODE).toBe('auto')
    expect(CALENDAR_MODE_OPTIONS[0].id).toBe('auto')
  })

  it('every non-auto picker option maps to a registered target', () => {
    for (const opt of CALENDAR_MODE_OPTIONS) {
      if (opt.id === 'auto') continue
      expect(CALENDAR_TARGETS[opt.id], `missing target for ${opt.id}`).toBeTruthy()
    }
  })
})
