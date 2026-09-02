import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  countCalendars,
  openWorkQueue,
  countViableCandidates,
  definedFields,
  mergeHistory,
  upsertPoint,
  main,
} from './update-event-history.mjs'

// main() stamps today's date; tests must derive it, never hardcode it.
const today = () => new Date().toISOString().slice(0, 10)

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
    osmGaps: [1, 2],
  }

  it('sums every term', () => {
    // 3 + 2 + 1 + 4 + 1 + 2 + 5 + 6 + 2
    expect(openWorkQueue(full)).toBe(26)
  })

  it('sums to 0 when every term is present but empty', () => {
    expect(openWorkQueue({
      uncertaintyStats: { outstanding: 0 },
      photoGaps: { venueGaps: [], eventGaps: [] },
      costGaps: [],
      settingGaps: { venueGaps: [], eventGaps: [] },
      duplicateStats: { candidates: 0 },
      geocodeErrors: [],
      osmGaps: [],
    })).toBe(0)
  })

  // The gap queues landed in build-errors.json at different times
  // (duplicateStats ~2026-06-17, settingGaps ~2026-07-06). Treating any absent
  // term as 0 would redefine the metric partway through the series, so EVERY
  // contributing key has to be present.
  it.each([
    'uncertaintyStats',
    'photoGaps',
    'costGaps',
    'settingGaps',
    'duplicateStats',
    'geocodeErrors',
    'osmGaps',
  ])('returns undefined when %s is absent', (key) => {
    const { [key]: _dropped, ...rest } = full
    expect(openWorkQueue(rest)).toBeUndefined()
  })

  it('is not fooled by an empty stats object', () => {
    expect(openWorkQueue({ ...full, duplicateStats: {} })).toBeUndefined()
    expect(openWorkQueue({ ...full, settingGaps: {} })).toBeUndefined()
    expect(openWorkQueue({ ...full, photoGaps: { venueGaps: [1] } })).toBeUndefined()
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

  // YAML and every Markdown renderer accept a fence with trailing whitespace;
  // an exact indexOf('---') would drop the file from the count silently.
  it('accepts a closing fence with trailing whitespace', () => {
    write('a.md', '---\nname: X\nstatus: candidate\n--- \n\nProse.\n')
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

// ------------------------------------------------------------------ main()

// These run main() against a temp working directory, since the script resolves
// its paths relative to cwd.
describe('main', () => {
  let dir

  const write = (rel, data) => {
    const full = path.join(dir, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, typeof data === 'string' ? data : JSON.stringify(data))
  }
  const readHistory = () => JSON.parse(readFileSync(path.join(dir, 'docs/event-history.json'), 'utf-8'))

  // main() takes an injectable root rather than the tests calling
  // process.chdir: chdir is unavailable when vitest runs in worker threads, and
  // this suite gates every calendar build.
  const run = (argv = []) => main(argv, { root: dir })

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'history-main-'))
    write('docs/source-candidates/a.md', '---\nstatus: candidate\n---\n\nx\n')
    write('output/manifest.json', { rippers: [{ calendars: [1, 2] }] })
    write('output/build-errors.json', {
      totalErrors: 9,
      geoStats: { totalEvents: 500 },
      uncertaintyStats: { outstanding: 1 },
      photoGaps: { venueGaps: [], eventGaps: [] },
      costGaps: [],
      settingGaps: { venueGaps: [], eventGaps: [] },
      duplicateStats: { candidates: 2 },
      geocodeErrors: [],
      osmGaps: [],
    })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('merges every source and adds today, writing all three destinations', () => {
    write('docs/event-history.json', [{ date: '2026-04-13', events: 100, calendars: 10 }])
    write('cached.json', [{ date: '2026-05-01', events: 200, calendars: 20 }])
    write('published.json', [{ date: '2026-06-01', events: 300, calendars: 30 }])

    expect(run(['--merge', 'cached.json', '--merge', 'published.json', '--cache-out', 'cached.json'])).toBe(0)

    const out = readHistory()
    expect(out.length).toBe(4) // three merged dates plus today
    expect(out.map((p) => p.date).slice(0, 3)).toEqual(['2026-04-13', '2026-05-01', '2026-06-01'])
    expect(existsSync(path.join(dir, 'output/event-history.json'))).toBe(true)
    expect(JSON.parse(readFileSync(path.join(dir, 'cached.json'), 'utf-8')).length).toBe(4)
  })

  // event-history.json is a required data file; skipping the write would fail
  // check-missing-urls AND drop the file from the site, knocking out the
  // published layer the next build merges from.
  it('still merges and republishes when there is no build output', () => {
    write('docs/event-history.json', [{ date: '2026-04-13', events: 100, calendars: 10 }])
    write('cached.json', [{ date: '2026-05-01', events: 200, calendars: 20 }])
    rmSync(path.join(dir, 'output/build-errors.json'))
    rmSync(path.join(dir, 'output/manifest.json'))

    expect(run(['--merge', 'cached.json'])).toBe(0)

    const out = readHistory()
    expect(out.map((p) => p.date)).toEqual(['2026-04-13', '2026-05-01']) // no new point
    expect(existsSync(path.join(dir, 'output/event-history.json'))).toBe(true)
  })

  // A corrupt committed file must fail loudly. Swallowing it would hand the
  // merge an empty base AND zero the shrink guard's baseline, so a one-point
  // series would be written back over everything.
  it('throws on a corrupt committed history instead of starting from empty', () => {
    write('docs/event-history.json', '{ this is not json')
    expect(() => run([])).toThrow(/not valid JSON/)
  })

  it('skips a merge source that does not exist', () => {
    write('docs/event-history.json', [{ date: '2026-04-13', events: 100 }])
    expect(run(['--merge', 'absent.json'])).toBe(0)
    expect(readHistory().length).toBe(2)
  })

  // A corrupt merge source must not fail the build (it is one recovery layer of
  // several) but must also not be silently written off as absent.
  // Guards the class of bug where a test hardcodes today's date: the suite gates
  // every calendar build, so it would go red on the next calendar day.
  it('stamps whatever today is, not a fixed date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-03-04T12:00:00Z'))
    try {
      write('docs/event-history.json', [{ date: '2026-04-13', events: 100 }])
      expect(run([])).toBe(0)
      expect(readHistory().at(-1).date).toBe('2027-03-04')
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips a corrupt merge source without failing', () => {
    write('docs/event-history.json', [{ date: '2026-04-13', events: 100 }])
    write('cached.json', 'truncated{{{')
    expect(run(['--merge', 'cached.json'])).toBe(0)
    expect(readHistory().length).toBe(2)
  })

  // The guard counts distinct dates. Counting raw entries would fail the build
  // permanently on a source carrying one duplicate, and the poisoned file gets
  // re-saved to the cache and restored next run.
  it('does not mistake a duplicate date in a source for truncation', () => {
    write('docs/event-history.json', [{ date: '2026-04-13', events: 100 }])
    write('cached.json', [
      { date: '2026-05-01', events: 1 },
      { date: '2026-05-01', events: 2 },
      { events: 3 },
    ])
    expect(run(['--merge', 'cached.json'])).toBe(0)
    // Derived, never hardcoded: main() stamps the point with today's date, so
    // a literal here would start failing the whole build the next day.
    expect(readHistory().map((p) => p.date)).toEqual(['2026-04-13', '2026-05-01', today()])
  })

  // A day when every source failed genuinely measures 0 events; dropping it
  // would hide the outage behind a straight line.
  it('records a real zero rather than treating it as no build output', () => {
    write('docs/event-history.json', [{ date: '2026-04-13', events: 100 }])
    write('output/manifest.json', { rippers: [] })
    write('output/build-errors.json', {
      totalErrors: 500,
      geoStats: { totalEvents: 0 },
      uncertaintyStats: { outstanding: 0 },
      photoGaps: { venueGaps: [], eventGaps: [] },
      costGaps: [],
      settingGaps: { venueGaps: [], eventGaps: [] },
      duplicateStats: { candidates: 0 },
      geocodeErrors: [],
      osmGaps: [],
    })
    expect(run([])).toBe(0)
    const today = readHistory().at(-1)
    expect(today.events).toBe(0)
    expect(today.calendars).toBe(0)
    expect(today.errors).toBe(500)
  })
})
