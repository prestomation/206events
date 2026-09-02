import { describe, it, expect } from 'vitest'
import { relativeDay, cadence, sharedTime } from './eventCadence.js'

// Instances carry js-joda-style datetimes with an IANA bracket. The bracket is
// stripped and the remainder parsed; an offset-free remainder parses as LOCAL
// time, which is exactly how the app renders (the viewer's own clock). Writing
// the fixtures without an offset keeps these assertions true in any runner
// timezone — CI is UTC, a contributor's laptop is not. The mixed-offset case
// gets its own test below, and `dateFormat.test.js` pins the DST-safe day
// arithmetic directly.
const at = (date, time = '19:00:00') => ({ date: `${date}T${time}[America/Los_Angeles]` })

// Local midnight-ish on Wednesday 2026-07-01, so the relative phrasing is fixed.
const NOW = new Date(2026, 6, 1, 9, 0)

describe('relativeDay', () => {
  it('names today, tomorrow and the past', () => {
    expect(relativeDay(at('2026-07-01').date, NOW)).toBe('Today')
    expect(relativeDay(at('2026-07-02').date, NOW)).toBe('Tomorrow')
    expect(relativeDay(at('2026-06-30').date, NOW)).toBe('Past')
  })

  it('counts days inside a fortnight and weeks beyond it', () => {
    expect(relativeDay(at('2026-07-04').date, NOW)).toBe('In 3 days')
    expect(relativeDay(at('2026-07-13').date, NOW)).toBe('In 12 days')
    expect(relativeDay(at('2026-07-15').date, NOW)).toBe('In 2 weeks')
    expect(relativeDay(at('2026-08-05').date, NOW)).toBe('In 5 weeks')
  })

  it('compares calendar days, not elapsed hours', () => {
    // 11:30pm "now" and a 1am event on the same calendar day is still Today.
    expect(relativeDay(at('2026-07-01', '01:00:00').date, new Date(2026, 6, 1, 23, 30))).toBe('Today')
  })

  it('returns an empty string for an unparseable date', () => {
    expect(relativeDay('not a date', NOW)).toBe('')
  })
})

describe('sharedTime', () => {
  it('returns the common start time', () => {
    expect(sharedTime([at('2026-07-02'), at('2026-07-09')])).toBe('7:00 PM')
  })

  it('returns null when a matinee and an evening showing are in one series', () => {
    expect(sharedTime([at('2026-07-02', '14:00:00'), at('2026-07-02', '20:00:00')])).toBeNull()
  })

  it('returns null when any instance is unparseable', () => {
    expect(sharedTime([at('2026-07-02'), { date: 'garbage' }])).toBeNull()
  })
})

describe('cadence', () => {
  it('names a weekly run', () => {
    expect(cadence([at('2026-07-02'), at('2026-07-09'), at('2026-07-16')]))
      .toBe('Every Thursday · 7:00 PM')
  })

  it('names a fortnightly run', () => {
    expect(cadence([at('2026-07-01'), at('2026-07-15'), at('2026-07-29')]))
      .toBe('Every other Wednesday · 7:00 PM')
  })

  it('names a monthly-by-weekday run', () => {
    expect(cadence([at('2026-07-05'), at('2026-08-02'), at('2026-08-30')]))
      .toBe('Monthly on Sundays · 7:00 PM')
  })

  it('names consecutive nights rather than counting them', () => {
    expect(cadence([at('2026-07-02'), at('2026-07-03'), at('2026-07-04')]))
      .toBe('Nightly · 7:00 PM')
  })

  it('falls back to a plain count when the gaps are irregular', () => {
    expect(cadence([at('2026-07-02'), at('2026-07-05'), at('2026-07-19')]))
      .toBe('3 dates · 7:00 PM')
  })

  it('handles a single date', () => {
    expect(cadence([at('2026-07-02')])).toBe('One date · 7:00 PM')
  })

  it('omits the time when the instances do not agree on one', () => {
    // groupEvents merges a matinee with an evening showing, so this is real:
    // printing either showtime as "the" time would be a confident lie.
    expect(cadence([at('2026-07-02', '14:00:00'), at('2026-07-09', '20:00:00')]))
      .toBe('Every Thursday')
  })

  it('still reads weekly when the offsets differ across a DST boundary', () => {
    // Real events-index strings: PDT before 2026-11-01, PST after. A raw
    // millisecond diff makes these gaps 7.04 days and loses "every <weekday>".
    const days = ['2026-10-29T19:00:00-07:00', '2026-11-05T19:00:00-08:00', '2026-11-12T19:00:00-08:00']
    const weekday = new Date(days[0]).toLocaleDateString('en-US', { weekday: 'long' })
    expect(cadence(days.map((date) => ({ date })))).toContain(`Every ${weekday}`)
  })

  it('is empty for no instances', () => {
    expect(cadence([])).toBe('')
  })
})
