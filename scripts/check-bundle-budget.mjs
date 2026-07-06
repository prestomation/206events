// Eager-bundle budget check (docs/lighthouse-performance-plan.md Phase 4).
//
// Reads the Vite build manifest (output/.vite/manifest.json), walks the
// STATIC import graph from the HTML entry (dynamic imports are excluded —
// they're lazy by design), gzips each eager asset, and fails when the eager
// JS or CSS totals exceed the committed budgets. This is what keeps the
// lazy-loading work (fuse.js, HealthDashboard, EventsMap, ical.js) from being
// silently undone by the next eager import of a heavy dependency.
//
// Run after a web build: `npm run check-bundle-budget`
// CI: wired into .github/workflows/web-e2e.yml after the e2e run (which
// builds the bundle via the Playwright webServer).

import { readFileSync, existsSync, appendFileSync } from 'fs'
import { gzipSync } from 'zlib'
import path from 'path'
import { fileURLToPath } from 'url'

// Budgets (gzip bytes) for everything the browser must download before the
// app is interactive. Current build (2026-07): eager JS ≈ 103 KB, CSS ≈ 17 KB —
// budgets leave ~25% headroom for organic growth. Raising a budget is a
// deliberate reviewed decision, not a mechanical fix for a red build: first
// check whether the growth belongs behind a dynamic import instead.
export const BUDGETS = {
  eagerJsGzipBytes: 130 * 1024,
  eagerCssGzipBytes: 25 * 1024,
}

// Walk the static import graph from the entry chunk. Returns { js, css } as
// lists of output file paths (relative to the build outDir). Dynamic imports
// are intentionally not followed.
export function collectEagerAssets(manifest) {
  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry)
  if (!entryKey) throw new Error('no entry chunk in Vite manifest')
  const js = new Set()
  const css = new Set()
  const visit = (key) => {
    const chunk = manifest[key]
    if (!chunk || js.has(chunk.file)) return
    js.add(chunk.file)
    for (const c of chunk.css || []) css.add(c)
    for (const imp of chunk.imports || []) visit(imp)
  }
  visit(entryKey)
  return { js: [...js], css: [...css] }
}

export function gzipSize(buf) {
  return gzipSync(buf, { level: 9 }).length
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const outDir = path.join(repoRoot, 'output')
  const manifestPath = path.join(outDir, '.vite', 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(`check-bundle-budget: ${manifestPath} not found — run the web build first (npm run web:build)`)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const { js, css } = collectEagerAssets(manifest)

  const measure = (files) =>
    files.map((f) => {
      const raw = readFileSync(path.join(outDir, f))
      return { file: f, raw: raw.length, gzip: gzipSize(raw) }
    })
  const jsSizes = measure(js)
  const cssSizes = measure(css)
  const jsTotal = jsSizes.reduce((s, a) => s + a.gzip, 0)
  const cssTotal = cssSizes.reduce((s, a) => s + a.gzip, 0)

  const rows = [...jsSizes, ...cssSizes]
    .map((a) => `| \`${a.file}\` | ${formatKb(a.raw)} | ${formatKb(a.gzip)} |`)
    .join('\n')
  const jsOver = jsTotal > BUDGETS.eagerJsGzipBytes
  const cssOver = cssTotal > BUDGETS.eagerCssGzipBytes
  const verdict = (over) => (over ? '❌ over budget' : '✅')
  const summary = `## 📦 Eager bundle budget

| Asset | Raw | Gzip |
| --- | --- | --- |
${rows}

| Total | Budget | Status |
| --- | --- | --- |
| JS ${formatKb(jsTotal)} | ${formatKb(BUDGETS.eagerJsGzipBytes)} | ${verdict(jsOver)} |
| CSS ${formatKb(cssTotal)} | ${formatKb(BUDGETS.eagerCssGzipBytes)} | ${verdict(cssOver)} |
`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  }
  if (jsOver || cssOver) {
    console.error(
      'Eager bundle exceeds budget. Before raising BUDGETS in scripts/check-bundle-budget.mjs, ' +
        'check whether the growth belongs behind a dynamic import (see docs/lighthouse-performance-plan.md Phase 1c).',
    )
    process.exit(1)
  }
}

// Only run as a CLI, not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
