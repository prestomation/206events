import { useState, useEffect, useRef } from 'react'
import { Ico } from '../redesign/icons.jsx'

const RADIUS_OPTIONS = [1, 2, 5, 10, 20]
const DEFAULT_RADIUS = 2
const PHOTON_URL = 'https://photon.komoot.io/api/'
const PHOTON_BBOX = '-122.6,47.3,-121.9,47.8'

/**
 * A chip showing a single geo filter. The body is a button that opens the
 * editor; a trailing × removes the filter. Styled to match the redesign's
 * filter chips (see `.a-geochip` in index.css).
 */
function GeoFilterChip({ filter, index, onEdit, onDelete }) {
  const label = filter.label || 'Location'
  return (
    <span className="a-geochip">
      <button
        type="button"
        className="a-geochip-body"
        onClick={() => onEdit(index)}
        title="Edit this location filter"
      >
        <span className="a-geochip-ico">{Ico.pin}</span>
        <span className="a-geochip-label">{label}</span>
        <span className="a-geochip-radius">{filter.radiusKm} km</span>
      </button>
      <button
        type="button"
        className="a-geochip-x"
        onClick={() => onDelete(index)}
        title="Remove"
        aria-label={`Remove ${label}`}
      >
        <span style={{ width: 12, height: 12 }}>{Ico.close}</span>
      </button>
    </span>
  )
}

/**
 * Address autocomplete using the Photon geocoding API.
 */
// Rate limit: max requests per window
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
const MIN_QUERY_LENGTH = 3
let _rateLimitCount = 0
let _rateLimitReset = Date.now() + RATE_LIMIT_WINDOW_MS

function checkRateLimit() {
  const now = Date.now()
  if (now > _rateLimitReset) {
    _rateLimitCount = 0
    _rateLimitReset = now + RATE_LIMIT_WINDOW_MS
  }
  if (_rateLimitCount >= RATE_LIMIT_MAX) return false
  _rateLimitCount++
  return true
}

function AddressAutocomplete({ onSelect }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      if (val.trim().length < MIN_QUERY_LENGTH) return
      if (!checkRateLimit()) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: val, limit: 5, bbox: PHOTON_BBOX })
        const res = await fetch(`${PHOTON_URL}?${params}`)
        if (res.ok) {
          const data = await res.json()
          // Validate response shape before using it
          const features = Array.isArray(data?.features) ? data.features.filter(
            f => f && typeof f === 'object' &&
              f.geometry && typeof f.geometry === 'object' &&
              Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2 &&
              typeof f.geometry.coordinates[0] === 'number' &&
              typeof f.geometry.coordinates[1] === 'number' &&
              f.properties && typeof f.properties === 'object'
          ) : []
          setSuggestions(features)
          setShowDropdown(true)
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const handleSelect = (feature) => {
    const [lng, lat] = feature.geometry.coordinates
    const props = feature.properties
    const name = [props.name, props.street, props.city, props.state]
      .filter(Boolean)
      .join(', ')
    setQuery(name)
    setSuggestions([])
    setShowDropdown(false)
    onSelect(lat, lng, name)
  }

  return (
    <div className="a-geoform-acwrap" ref={wrapRef}>
      <span className="a-geoform-acico">{Ico.search}</span>
      <input
        type="text"
        className="a-input a-geoform-acinput"
        placeholder="Search address or place…"
        value={query}
        onChange={handleInput}
        autoComplete="off"
      />
      {loading && <span className="a-geoform-spin" role="status" aria-label="Searching" />}
      {showDropdown && suggestions.length > 0 && (
        <ul className="a-geoform-dropdown">
          {suggestions.map((feat, i) => {
            const p = feat.properties
            const display = [p.name, p.street, p.city, p.state, p.country]
              .filter(Boolean)
              .join(', ')
            const [lng, lat] = feat.geometry.coordinates
            return (
              <li
                key={`${lat}-${lng}-${i}`}
                className="a-geoform-dropdown-item"
                onMouseDown={() => handleSelect(feat)}
              >
                <span className="a-geoform-dropdown-ico">{Ico.pin}</span>
                <span className="a-geoform-dropdown-text">{display}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Form for adding or editing a geo filter.
 */
function GeoFilterForm({ initialFilter, onSave, onCancel, isMobile }) {
  const [lat, setLat] = useState(initialFilter?.lat ?? null)
  const [lng, setLng] = useState(initialFilter?.lng ?? null)
  const [locationLabel, setLocationLabel] = useState('')
  const [radiusKm, setRadiusKm] = useState(initialFilter?.radiusKm ?? DEFAULT_RADIUS)
  const [label, setLabel] = useState(initialFilter?.label ?? '')
  const [geolocating, setGeolocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  const hasLocation = lat !== null && lng !== null

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }
    setGeolocating(true)
    setGeoError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setLocationLabel('Current location')
        setGeolocating(false)
      },
      (err) => {
        setGeoError('Location access denied. You can search for an address instead.')
        setGeolocating(false)
      },
      { timeout: 10000 }
    )
  }

  const handleAddressSelect = (selLat, selLng, name) => {
    setLat(selLat)
    setLng(selLng)
    setLocationLabel(name)
    setGeoError('')
  }

  const handleSave = () => {
    if (!hasLocation) return
    onSave({ lat, lng, radiusKm, label: label.trim() || undefined })
  }

  const radiusIndex = RADIUS_OPTIONS.indexOf(radiusKm)

  return (
    <div className="a-geoform">
      {!hasLocation ? (
        <>
          <button
            type="button"
            className="btn btn-blue a-geoform-btn"
            onClick={handleUseMyLocation}
            disabled={geolocating}
          >
            {geolocating
              ? <span className="a-geoform-spin a-geoform-spin--onblue" />
              : Ico.pin}
            {geolocating ? 'Getting location…' : 'Use my location'}
          </button>
          {geoError && <div className="a-geoform-error">{geoError}</div>}
          <div className="a-geoform-or"><span>or</span></div>
          <AddressAutocomplete onSelect={handleAddressSelect} />
          <div className="a-geoform-actions">
            <button type="button" className="btn btn-ghost a-geoform-btn" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="a-geoform-locset">
            <span className="a-geoform-locset-ico">{Ico.pin}</span>
            <span className="a-geoform-locset-label">{locationLabel || 'Location set'}</span>
            <button
              type="button"
              className="a-geoform-change"
              onClick={() => { setLat(null); setLng(null); setLocationLabel('') }}
            >
              Change
            </button>
          </div>

          <div className="a-geoform-field">
            <div className="a-geoform-fieldlabel">
              <span>Radius</span>
              <strong>{radiusKm} km</strong>
            </div>
            {isMobile ? (
              <div className="a-geoform-presets">
                {RADIUS_OPTIONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={`a-geoform-preset${radiusKm === r ? ' on' : ''}`}
                    onClick={() => setRadiusKm(r)}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="range"
                className="a-geoform-slider"
                min={0}
                max={RADIUS_OPTIONS.length - 1}
                step={1}
                value={radiusIndex === -1 ? 1 : radiusIndex}
                onChange={(e) => setRadiusKm(RADIUS_OPTIONS[parseInt(e.target.value)])}
                aria-label="Search radius"
              />
            )}
          </div>

          <div className="a-geoform-field">
            <input
              type="text"
              className="a-input"
              placeholder="Label (e.g. Home, Work, Capitol Hill)"
              value={label}
              maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="a-geoform-actions">
            <button type="button" className="btn btn-ghost a-geoform-btn" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-blue a-geoform-btn" onClick={handleSave}>Save</button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The full Geo Filters section shown in the You view.
 */
export function GeoFiltersSection({ authUser, geoFilters, onAdd, onDelete, onEdit, isMobile }) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)

  const handleSaveNew = (filter) => {
    onAdd(filter)
    setIsAdding(false)
  }

  const handleSaveEdit = (filter) => {
    onEdit(editingIndex, filter)
    setEditingIndex(null)
  }

  const handleDelete = (index) => {
    onDelete(index)
    if (editingIndex === index) setEditingIndex(null)
  }

  return (
    <div className="a-geofilters">
      {geoFilters.length > 0 && (
        <div className="a-geofilters-chips">
          {geoFilters.map((filter, index) => (
            <span key={`${filter.lat}-${filter.lng}-${filter.radiusKm}-${index}`} className="a-geofilters-chipslot">
              <GeoFilterChip
                filter={filter}
                index={index}
                onEdit={(i) => {
                  setIsAdding(false)
                  setEditingIndex(i)
                }}
                onDelete={handleDelete}
              />
              {editingIndex === index && (
                <GeoFilterForm
                  initialFilter={filter}
                  onSave={handleSaveEdit}
                  onCancel={() => setEditingIndex(null)}
                  isMobile={isMobile}
                />
              )}
            </span>
          ))}
        </div>
      )}

      {!isAdding && editingIndex === null && (
        <button
          type="button"
          className="btn btn-ghost a-geofilters-add"
          onClick={() => setIsAdding(true)}
          disabled={geoFilters.length >= 10}
          title={geoFilters.length >= 10 ? 'Maximum 10 location filters' : 'Add a location filter'}
        >
          {Ico.plus} Add location
        </button>
      )}

      {isAdding && (
        <GeoFilterForm
          onSave={handleSaveNew}
          onCancel={() => setIsAdding(false)}
          isMobile={isMobile}
        />
      )}
    </div>
  )
}
