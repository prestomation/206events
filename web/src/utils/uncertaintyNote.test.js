import { describe, it, expect } from 'vitest'
import { stripUncertaintyNote } from './uncertaintyNote.js'

// Client mirror of lib/uncertainty-merge.ts `stripUncertaintyNote`; keep these
// cases in sync with lib/uncertainty-merge.test.ts.
describe('stripUncertaintyNote (client)', () => {
  it('returns empty / nullish inputs unchanged', () => {
    expect(stripUncertaintyNote('')).toBe('')
    expect(stripUncertaintyNote(undefined)).toBeUndefined()
    expect(stripUncertaintyNote(null)).toBeNull()
  })

  it('leaves a note-free description untouched', () => {
    expect(stripUncertaintyNote('Live jazz every night.')).toBe('Live jazz every night.')
  })

  it('removes an appended pending note', () => {
    expect(stripUncertaintyNote('Doors at 8.\n\n⚠️ Time is approximate — automated verification pending.'))
      .toBe('Doors at 8.')
  })

  it('removes an appended unresolvable note including a Source: suffix', () => {
    expect(stripUncertaintyNote('Headliner plus support.\n\n⚠️ Duration could not be verified against the source.\nSource: https://example.com/e'))
      .toBe('Headliner plus support.')
  })

  it('strips only our trailing note when the description has its own earlier ⚠️ block', () => {
    const desc = 'Doors at 8.\n\n⚠️ 21+ with valid ID.\n\n⚠️ Cost could not be verified against the source.'
    // lastIndexOf keeps the venue’s own "21+" caveat, removing only our note.
    expect(stripUncertaintyNote(desc)).toBe('Doors at 8.\n\n⚠️ 21+ with valid ID.')
  })

  it('returns "" when the description was only the note', () => {
    expect(stripUncertaintyNote('⚠️ Cost could not be verified against the source.')).toBe('')
  })
})
