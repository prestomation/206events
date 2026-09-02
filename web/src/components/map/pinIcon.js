// web/src/components/map/pinIcon.js
//
// The map's marker icon, ported from the design system's MapPin: a pill that
// says what it is -- venue name, how many dates sit behind it, a category dot
// -- so a pin is readable before it is clicked.
//
// Two things shape this file:
//
// 1. A pill up to --map-pin-max-w (190px) cannot be the default at city zoom.
//    MarkerClusterGroup already bounds how many leaf markers exist, but a
//    screenful of overlapping 190px pills is unreadable regardless. So the
//    label is BUDGETED (see shouldLabelPins): above a zoom threshold, with few
//    enough pins on screen, or because the pin is the selected/hovered one.
//    Everything else is a dot-only pill of roughly the current footprint.
//
// 2. The label is source text. Leaflet 1.9's DivIcon accepts an HTMLElement for
//    `html` (DivIcon.js), so the pill is BUILT, not concatenated, and the label
//    goes in via textContent. There is no HTML string, so there is nothing to
//    escape and no way to get the escaping wrong. `createIcon` also only runs
//    when the marker actually enters the map, so nothing is constructed for a
//    marker the cluster layer swallows.
import L from 'leaflet'

// Label only when the map is zoomed in enough for pins to be spatially
// separated, AND few enough are on screen for the labels not to collide.
export const PIN_LABEL_MIN_ZOOM = 14
export const PIN_LABEL_MAX_VISIBLE = 14

/** Whether the label tier is on for the current viewport. */
export function shouldLabelPins(zoom, visibleCount) {
  return zoom >= PIN_LABEL_MIN_ZOOM && visibleCount <= PIN_LABEL_MAX_VISIBLE
}

// Icon box. Height covers the pill plus its stem; the labelled box is the
// design system's max pill width, with the pill centred inside it. Keeping a
// real iconSize (rather than letting CSS size an unmeasured box) is what lets
// MarkerClusterGroup and spiderfy reason about the marker.
const PIN_H = 39
const PIN_W_LABELLED = 190
const PIN_W_DOT = 30

const PinIcon = L.DivIcon.extend({
  createIcon(oldIcon) {
    const div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon : document.createElement('div')
    const o = this.options

    const body = document.createElement('span')
    body.className = 'mpin-body'

    const dot = document.createElement('i')
    dot.className = 'mpin-dot'
    if (o.dotColor) dot.style.background = o.dotColor
    body.appendChild(dot)

    if (o.labelled) {
      const label = document.createElement('span')
      label.className = 'mpin-label'
      label.textContent = o.label || ''
      body.appendChild(label)
    }
    if (o.count > 1) {
      const count = document.createElement('span')
      count.className = 'mpin-count'
      count.textContent = String(o.count)
      body.appendChild(count)
    }

    const stem = document.createElement('i')
    stem.className = 'mpin-stem'

    div.replaceChildren(body, stem)
    this._setIconStyles(div, 'icon')
    return div
  },
})

/**
 * Build the icon for one venue pin.
 *   label     the venue (or, for a single-series pin, the event) name
 *   count     how many dates sit behind the pin; 1 renders no count
 *   dotColor  the category colour
 *   labelled  label tier on for this pin
 *   selected  its popup is open -- always labelled, always on top
 */
export function createPinIcon({ label, count, dotColor, labelled = false, selected = false }) {
  const showLabel = labelled || selected
  const w = showLabel ? PIN_W_LABELLED : PIN_W_DOT
  return new PinIcon({
    className: `mpin${selected ? ' mpin--sel' : ''}${showLabel ? '' : ' mpin--dot'}`,
    label,
    count,
    dotColor,
    labelled: showLabel,
    iconSize: [w, PIN_H],
    iconAnchor: [w / 2, PIN_H],
    popupAnchor: [0, -PIN_H],
  })
}
