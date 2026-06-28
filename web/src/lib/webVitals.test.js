import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isReportingEnv, vitalPath, reportVital, flushVitals } from './webVitals.js'

describe('webVitals', () => {
  describe('isReportingEnv', () => {
    it('reports on a production host', () => {
      expect(isReportingEnv({ hostname: '206.events', pathname: '/' })).toBe(true)
    })

    it('does not report from localhost / 127.0.0.1', () => {
      expect(isReportingEnv({ hostname: 'localhost', pathname: '/' })).toBe(false)
      expect(isReportingEnv({ hostname: '127.0.0.1', pathname: '/' })).toBe(false)
    })

    it('does not report from a gh-pages /preview/ path', () => {
      expect(isReportingEnv({ hostname: 'prestomation.github.io', pathname: '/206events/preview/743/' })).toBe(false)
    })

    it('does not report from a Cloudflare Pages preview (*.pages.dev)', () => {
      expect(isReportingEnv({ hostname: 'pr-743.206events.pages.dev', pathname: '/' })).toBe(false)
    })

    it('returns false when there is no location', () => {
      expect(isReportingEnv(null)).toBe(false)
    })
  })

  describe('vitalPath', () => {
    it('buckets a metric by its rating', () => {
      expect(vitalPath({ name: 'INP', rating: 'poor' })).toBe('vitals/INP/poor')
      expect(vitalPath({ name: 'LCP', rating: 'good' })).toBe('vitals/LCP/good')
    })

    it('falls back to "unknown" when rating is absent', () => {
      expect(vitalPath({ name: 'CLS' })).toBe('vitals/CLS/unknown')
    })
  })

  describe('reportVital / flushVitals', () => {
    let count
    beforeEach(() => {
      count = vi.fn()
      // Drain any queue left by a prior test against a present counter.
      window.goatcounter = { count }
      flushVitals()
      count.mockClear()
    })

    afterEach(() => {
      delete window.goatcounter
    })

    it('forwards a bucketed event to GoatCounter', () => {
      reportVital({ name: 'INP', rating: 'poor' })
      expect(count).toHaveBeenCalledWith({ path: 'vitals/INP/poor', title: 'web-vital', event: true })
    })

    it('queues without throwing when GoatCounter is absent, then flushes once it loads', () => {
      delete window.goatcounter
      expect(() => reportVital({ name: 'LCP', rating: 'good' })).not.toThrow()
      // Nothing sent yet — count.js hasn't loaded.
      const late = vi.fn()
      flushVitals({ count: late })
      expect(late).toHaveBeenCalledWith({ path: 'vitals/LCP/good', title: 'web-vital', event: true })
    })

    it('is a no-op when GoatCounter has no count function', () => {
      expect(() => flushVitals({})).not.toThrow()
    })

    it('swallows a throwing count() so a beacon never breaks the page', () => {
      const throwing = vi.fn(() => { throw new Error('blocked') })
      window.goatcounter = { count: throwing }
      expect(() => reportVital({ name: 'TTFB', rating: 'good' })).not.toThrow()
      // The throwing counter must actually have been exercised (otherwise this
      // test would pass trivially without proving the catch path runs).
      expect(throwing).toHaveBeenCalledWith({ path: 'vitals/TTFB/good', title: 'web-vital', event: true })
    })
  })
})
