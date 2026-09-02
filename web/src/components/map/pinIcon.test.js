import { describe, it, expect } from 'vitest'
import { createPinIcon, shouldLabelPins, PIN_LABEL_MIN_ZOOM, PIN_LABEL_MAX_VISIBLE } from './pinIcon.js'

const build = (opts) => createPinIcon(opts).createIcon()

describe('shouldLabelPins', () => {
  it('labels only when zoomed in enough AND few enough pins are on screen', () => {
    expect(shouldLabelPins(PIN_LABEL_MIN_ZOOM, PIN_LABEL_MAX_VISIBLE)).toBe(true)
    expect(shouldLabelPins(PIN_LABEL_MIN_ZOOM - 1, 1)).toBe(false)
    expect(shouldLabelPins(18, PIN_LABEL_MAX_VISIBLE + 1)).toBe(false)
  })

  it('treats a missing zoom as too far out', () => {
    expect(shouldLabelPins(0, 1)).toBe(false)
  })
})

describe('createPinIcon', () => {
  it('builds a labelled pill with the name, the date count and a category dot', () => {
    const el = build({ label: 'Neumos', count: 3, dotColor: '#7c3aed', labelled: true })
    expect(el.querySelector('.mpin-label').textContent).toBe('Neumos')
    expect(el.querySelector('.mpin-count').textContent).toBe('3')
    expect(el.querySelector('.mpin-dot').style.background).toBe('rgb(124, 58, 237)')
    expect(el.querySelector('.mpin-stem')).not.toBeNull()
  })

  it('drops the label outside the budget but keeps the dot', () => {
    const el = build({ label: 'Neumos', count: 3, labelled: false })
    expect(el.querySelector('.mpin-label')).toBeNull()
    expect(el.querySelector('.mpin-dot')).not.toBeNull()
    expect(el.className).toContain('mpin--dot')
  })

  it('labels the selected pin whatever the budget says, and marks it', () => {
    const el = build({ label: 'Neumos', labelled: false, selected: true })
    expect(el.querySelector('.mpin-label').textContent).toBe('Neumos')
    expect(el.className).toContain('mpin--sel')
    expect(el.className).not.toContain('mpin--dot')
  })

  it('omits the count for a single date rather than printing a lonely 1', () => {
    expect(build({ label: 'Neumos', count: 1, labelled: true }).querySelector('.mpin-count')).toBeNull()
    expect(build({ label: 'Neumos', count: 2, labelled: true }).querySelector('.mpin-count').textContent).toBe('2')
  })

  // The label is source text. It is set with textContent on a built element,
  // never concatenated into an HTML string, so markup in a venue name is inert
  // by construction rather than by remembering to escape it.
  it('treats markup in a venue name as text, not HTML', () => {
    const nasty = '<img src=x onerror=alert(1)>Neumos'
    const el = build({ label: nasty, labelled: true })
    expect(el.querySelector('.mpin-label').textContent).toBe(nasty)
    expect(el.querySelectorAll('img')).toHaveLength(0)
  })

  it('handles a missing label without printing "undefined"', () => {
    expect(build({ labelled: true }).querySelector('.mpin-label').textContent).toBe('')
  })

  // A real iconSize keeps MarkerClusterGroup and spiderfy able to reason about
  // the marker, and the anchor puts the stem's tip on the coordinate.
  it('anchors the pill by its stem tip and sizes the box honestly', () => {
    const labelled = createPinIcon({ label: 'Neumos', labelled: true })
    expect(labelled.options.iconAnchor).toEqual([95, 39])
    expect(labelled.options.iconSize).toEqual([190, 39])

    const dot = createPinIcon({ label: 'Neumos', labelled: false })
    expect(dot.options.iconSize).toEqual([30, 39])
    expect(dot.options.iconAnchor).toEqual([15, 39])
  })

  it('reuses the element Leaflet hands back rather than leaking a new one', () => {
    const icon = createPinIcon({ label: 'A', labelled: true })
    const first = icon.createIcon()
    const second = icon.createIcon(first)
    expect(second).toBe(first)
    expect(second.querySelectorAll('.mpin-body')).toHaveLength(1)
  })
})
