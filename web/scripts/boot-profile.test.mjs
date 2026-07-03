import { describe, it, expect } from 'vitest'
import { median, summarize } from './boot-profile.mjs'

describe('median', () => {
  it('picks the middle of an odd-length set regardless of order', () => {
    expect(median([900, 100, 500])).toBe(500)
  })
  it('averages the two middles of an even-length set', () => {
    expect(median([100, 200, 400, 800])).toBe(300)
  })
  it('handles a single run', () => {
    expect(median([42])).toBe(42)
  })
})

describe('summarize', () => {
  it('takes the per-metric median across runs', () => {
    const runs = [
      { worstTask: 900, tapResponse: 150 },
      { worstTask: 700, tapResponse: 400 },
      { worstTask: 800, tapResponse: 180 },
    ]
    expect(summarize(runs)).toEqual({ worstTask: 800, tapResponse: 180 })
  })
})
