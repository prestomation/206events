// Design-system static analysis for the redesign (App206) UI.
//
// These tests fail the build when JSX drifts away from the token system in
// index.css. The class of bug they catch is real and has happened twice:
// inline styles referencing CSS variables that don't exist (`var(--green)`,
// `var(--danger)`) whose hardcoded fallbacks silently render instead — the
// token system *looks* used, but dark mode / palette changes never reach the
// element. Rules:
//
//   1. Every `var(--token)` referenced in redesign JSX must be defined in a
//      CSS file (or set inline via a `'--token':` style property).
//   2. No literal fallback in `var(--token, #hex)` form — fallbacks are how
//      undefined tokens slip through unnoticed. Define the token instead.
//   3. No raw color literals (hex / rgb / hsl) in redesign JSX outside the
//      neutral allowlist (#fff / #000, used for contrast text and gradient
//      mixing). Brand-logo SVGs in icons.jsx are exempt.
//
// Unlike typical unit tests, this file intentionally reads the real source
// tree from disk (no mocks): the *sources themselves* are the test subject,
// so the scan must see exactly what ships.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..')

const jsxFiles = readdirSync(__dirname)
  .filter((f) => f.endsWith('.jsx') && !f.includes('.test.'))
  .map((f) => ({ name: f, text: readFileSync(join(__dirname, f), 'utf8') }))

function cssFilesUnder(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') out.push(...cssFilesUnder(p))
    else if (entry.name.endsWith('.css')) out.push(p)
  }
  return out
}

// Tokens defined anywhere in web/src CSS (`--name: value`) plus inline JSX
// definitions (`'--name': value` style properties).
const definedTokens = new Set()
for (const file of cssFilesUnder(SRC)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/--([a-zA-Z0-9-]+)\s*:/g)) {
    definedTokens.add(m[1])
  }
}
for (const { text } of jsxFiles) {
  for (const m of text.matchAll(/['"]--([a-zA-Z0-9-]+)['"]\s*:/g)) {
    definedTokens.add(m[1])
  }
}

describe('design system: redesign JSX uses real tokens', () => {
  it('every var(--token) used in redesign JSX is defined in CSS', () => {
    const undefinedUses = []
    for (const { name, text } of jsxFiles) {
      for (const m of text.matchAll(/var\(--([a-zA-Z0-9-]+)/g)) {
        if (!definedTokens.has(m[1])) undefinedUses.push(`${name}: var(--${m[1]})`)
      }
    }
    expect(undefinedUses, 'Undefined design tokens referenced from JSX — define them in index.css').toEqual([])
  })

  it('no literal fallbacks in var() — define the token instead', () => {
    const fallbacks = []
    for (const { name, text } of jsxFiles) {
      for (const m of text.matchAll(/var\(--[a-zA-Z0-9-]+\s*,\s*[^)v][^)]*\)/g)) {
        fallbacks.push(`${name}: ${m[0]}`)
      }
    }
    expect(fallbacks, 'var() literal fallbacks mask undefined tokens — add the token to index.css and drop the fallback').toEqual([])
  })

  it('no raw color literals in redesign JSX outside the neutral allowlist', () => {
    const NEUTRALS = new Set(['#fff', '#ffffff', '#000', '#000000'])
    const EXEMPT_FILES = new Set(['icons.jsx']) // brand-logo SVG fills
    const violations = []
    for (const { name, text } of jsxFiles) {
      if (EXEMPT_FILES.has(name)) continue
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\(/g)) {
        const tok = m[0].toLowerCase()
        if (tok.startsWith('#') && NEUTRALS.has(tok)) continue
        violations.push(`${name}: ${m[0]}`)
      }
    }
    expect(violations, 'Raw colors in redesign JSX — use a design token (var(--…)) from index.css').toEqual([])
  })
})
