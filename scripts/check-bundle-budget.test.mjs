import { describe, it, expect } from 'vitest'
import { collectEagerAssets, gzipSize, BUDGETS } from './check-bundle-budget.mjs'

// A trimmed Vite manifest shaped like ours: HTML entry importing a vendor
// chunk statically, with fuse/map/dashboard behind dynamic imports.
const manifest = {
  'index.html': {
    file: 'assets/index-abc.js',
    isEntry: true,
    imports: ['_vendor-def.js'],
    dynamicImports: ['node_modules/fuse.js/dist/fuse.mjs', 'src/components/EventsMap.jsx'],
    css: ['assets/index-abc.css'],
  },
  '_vendor-def.js': {
    file: 'assets/vendor-def.js',
  },
  'node_modules/fuse.js/dist/fuse.mjs': {
    file: 'assets/fuse-ghi.js',
  },
  'src/components/EventsMap.jsx': {
    file: 'assets/EventsMap-jkl.js',
    css: ['assets/EventsMap-jkl.css'],
  },
}

describe('collectEagerAssets', () => {
  it('walks static imports from the entry and collects its CSS', () => {
    const { js, css } = collectEagerAssets(manifest)
    expect(js.sort()).toEqual(['assets/index-abc.js', 'assets/vendor-def.js'])
    expect(css).toEqual(['assets/index-abc.css'])
  })

  it('does not follow dynamic imports (lazy chunks stay out of the budget)', () => {
    const { js, css } = collectEagerAssets(manifest)
    expect(js).not.toContain('assets/fuse-ghi.js')
    expect(js).not.toContain('assets/EventsMap-jkl.js')
    expect(css).not.toContain('assets/EventsMap-jkl.css')
  })

  it('survives import cycles', () => {
    const cyclic = {
      'index.html': { file: 'a.js', isEntry: true, imports: ['b'] },
      b: { file: 'b.js', imports: ['index.html'] },
    }
    expect(collectEagerAssets(cyclic).js.sort()).toEqual(['a.js', 'b.js'])
  })

  it('throws when there is no entry', () => {
    expect(() => collectEagerAssets({ b: { file: 'b.js' } })).toThrow(/entry/)
  })
})

describe('gzipSize', () => {
  it('returns the compressed size, smaller than raw for compressible input', () => {
    const buf = Buffer.from('a'.repeat(10_000))
    expect(gzipSize(buf)).toBeLessThan(buf.length)
    expect(gzipSize(buf)).toBeGreaterThan(0)
  })
})

describe('BUDGETS', () => {
  it('has sane positive budgets', () => {
    expect(BUDGETS.eagerJsGzipBytes).toBeGreaterThan(0)
    expect(BUDGETS.eagerCssGzipBytes).toBeGreaterThan(0)
  })
})
