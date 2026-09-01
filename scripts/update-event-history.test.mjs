import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  countCalendars,
  openWorkQueue,
  countViableCandidates,
  definedFields,
  mergeHistory,
  upsertPoint,
} from './update-event-history.mjs'

describe('countCalendars', () => {
  it('sums ripper calendars, recurring, and external', () => {
    expect(
      countCalendars({
        rippers: [{ calendars: [1, 2, 3] }, { calendars: [4] }],
        recurringCalendars: [1, 2],
        externalCalendars: [1],
      })
    ).toBe(7)
  })

  it('tolerates a ripper with no calendars array', () => {
    expect(countCalendars({ rippers: [{}, { calendars: [1] }] })).toBe(1)
  })

  it('returns undefined with no manifest, never 0', () => {
    expect(countCalendars(null)).toBeUndefined()
  })
})

describe('openWorkQueue', () => {
  const full = {
    uncertaintyStats: { outstanding: 3 },
    photoGaps: { venueGaps: [1, 2], eventGaps: [1] },
    costGaps: [1, 2, 3, 4],
    settingGaps: { venueGaps: [1], eventGaps: [1, 2] },
    duplicateStats: { candidates: 5 },
    geocodeErrors: [1, 2, 3, 4, 5, 6],
  }

  it('sums all seven terms', () => {
    // 3 + 2 + 1 + 4 + 1 + 2 + 5 + 6
    expect(openWorkQueue(full)).toBe(24)
  })

  it('treats every missing sub-key as 0 without throwing', () => {
    expect(openWorkQueue({ duplicateStats: { candidates: 0 } })).toBe(0)
  })

  // Builds predating cross-source dedup (~PR 700) have no duplicateStats.
  // Dropping the term would change the metric's definition mid-series.
  it('returns undefined when duplicateStats is absent', () => {
    const { duplicateStats, ...rest } = full
    expect(openWorkQueue(rest)).toBeUndefined()
  })

  it('is not fooled by an empty duplicateStats object', () => {
    expect(openWorkQueue({ ...full, duplicateStats: {} })).toBeUndefined()
  })

  it('returns undefined for a missing report', () => {
    expect(openWorkQueue(null)).toBeUndefined()
  })
})

describe('countViableCandidates', () => {
  let dir

  const write = (name, body) => writeFileSync(path.join(dir, name), body)
  const fm = (status, extra = '') => `---\nname: Some Place\nstatus: ${status}\n${extra}---\n\nProse.\n`

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'candidates-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('counts only candidate and investigating', () => {
    write('a.md', fm('candidate'))
    write('b.md', fm('investigating'))
    write('c.md', fm('added'))
    write('d.md', fm('notviable'))
    write('e.md', fm('blocked'))
    write('f.md', fm('dead'))
    write('g.md', fm('proxy'))
    expect(countViableCandidates(dir)).toBe(2)
  })

  it('skips README.md and non-markdown files', () => {
    write('a.md', fm('candidate'))
    write('README.md', fm('candidate'))
    write('notes.txt', fm('candidate'))
    expect(countViableCandidates(dir)).toBe(1)
  })

  it('skips a file with no frontmatter', () => {
    write('a.md', fm('candidate'))
    write('b.md', 'status: candidate\n\nNo fences here.\n')
    expect(countViableCandidates(dir)).toBe(1)
  })

  it('skips a file whose frontmatter is never closed', () => {
    write('a.md', fm('candidate'))
    write('b.md', '---\nstatus: candidate\n\nunterminated\n')
    expect(countViableCandidates(dir)).toBe(1)
  })

  it('is not fooled by a status:-lookalike line in the prose body', () => {
    write('a.md', '---\nname: X\nstatus: added\n---\n\nstatus: candidate — was, once.\n')
    expect(countViableCandidates(dir)).toBe(0)
  })

  // Real files carry unquoted colons in name: values, which is why this is a
  // line scan and not a YAML parse.
  it('handles an unquoted colon in a sibling frontmatter value', () => {
    write('a.md', '---\nname: Barks, Bikes + Brews: Dog Days of Summer\nstatus: candidate\n---\n\nProse.\n')
    expect(countViableCandidates(dir)).toBe(1)
  })

  it('returns undefined for a missing directory, never 0', () => {
    expect(countViableCandidates(path.join(dir, 'nope'))).toBeUndefined()
  })

  it('returns undefined when nothing parsed, never 0', () => {
    write('README.md', fm('candidate'))
    expect(countViableCandidates(dir)).toBeUndefined()
  })
})

describe('definedFields', () => {
  it('drops undefined and null but keeps 0 and empty string', () => {
    expect(definedFields({ a: 1, b: undefined, c: null, d: 0, e: '' })).toEqual({ a: 1, d: 0, e: '' })
  })
})

describe('mergeHistory', () => {
  it('unions fields per date, incoming winning', () => {
    const base = [{ date: '2026-05-01', events: 100, calendars: 10 }]
    const incoming = [{ date: '2026-05-01', events: 111, candidates: 5 }]
    expect(mergeHistory(base, incoming)).toEqual([
      { date: '2026-05-01', events: 111, calendars: 10, candidates: 5 },
    ])
  })

  // The whole point of the merge: a source that can't compute a field must
  // never erase a source that could.
  it('never lets undefined or null in incoming erase base', () => {
    const base = [{ date: '2026-05-01', events: 100, candidates: 5 }]
    const incoming = [{ date: '2026-05-01', events: 111, candidates: undefined, calendars: null }]
    expect(mergeHistory(base, incoming)).toEqual([
      { date: '2026-05-01', events: 111, candidates: 5 },
    ])
  })

  it('keeps dates present on only one side', () => {
    const merged = mergeHistory(
      [{ date: '2026-05-01', events: 1 }],
      [{ date: '2026-06-01', events: 2 }]
    )
    expect(merged.map((p) => p.date)).toEqual(['2026-05-01', '2026-06-01'])
  })

  it('sorts the result by date regardless of input order', () => {
    const merged = mergeHistory(
      [{ date: '2026-07-01', events: 3 }, { date: '2026-05-01', events: 1 }],
      [{ date: '2026-06-01', events: 2 }]
    )
    expect(merged.map((p) => p.date)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01'])
  })

  it('tolerates null inputs and entries without a date', () => {
    expect(mergeHistory(null, null)).toEqual([])
    expect(mergeHistory([{ events: 1 }], [{ date: '2026-05-01', events: 2 }])).toEqual([
      { date: '2026-05-01', events: 2 },
    ])
  })

  it('never shrinks: the merged length is at least each input length', () => {
    const base = [{ date: '2026-05-01' }, { date: '2026-05-02' }, { date: '2026-05-03' }]
    const incoming = [{ date: '2026-05-03' }, { date: '2026-06-01' }]
    const merged = mergeHistory(base, incoming)
    expect(merged.length).toBeGreaterThanOrEqual(base.length)
    expect(merged.length).toBeGreaterThanOrEqual(incoming.length)
    expect(merged.length).toBe(4)
  })
})

describe('upsertPoint', () => {
  // A push build and the nightly schedule both write the same day; a replace
  // would drop whatever fields the second run couldn't compute.
  it('merges into an existing day rather than replacing it', () => {
    const history = [{ date: '2026-09-01', events: 100, calendars: 10, candidates: 5 }]
    expect(upsertPoint(history, { date: '2026-09-01', events: 120 })).toEqual([
      { date: '2026-09-01', events: 120, calendars: 10, candidates: 5 },
    ])
  })

  it('appends a new day in sorted position', () => {
    const history = [{ date: '2026-09-01', events: 100 }]
    expect(upsertPoint(history, { date: '2026-08-31', events: 90 }).map((p) => p.date)).toEqual([
      '2026-08-31',
      '2026-09-01',
    ])
  })
})

describe('countViableCandidates against the real tree', () => {
  it('reports a plausible count for docs/source-candidates', () => {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
    const n = countViableCandidates(path.join(repoRoot, 'docs/source-candidates'))
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(2000)
  })
})
