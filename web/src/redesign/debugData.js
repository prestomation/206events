// Pure selectors that join a build-errors.json document to a channel
// (venue/source) or an event, for the debug-mode panels in ChannelDetail /
// EventDetail. No React, fully unit-testable.
//
// build-errors.json is the single source of build-health truth (see AGENTS.md
// "Reporting Parity"); these helpers are read-only consumers of it — they add
// no new categories. The join keys mirror the rest of the app: events join on
// `eventKey` (`summary|date`), sources join on the source-name string that the
// ripper/external/recurring config carries.

import { eventKey } from '../lib/eventKey.js'

// eventKey for a build-errors event-ish entry that carries { summary, date }
// (uncertainEvents[].event, costGaps[], photoGaps.eventGaps[], duplicate
// candidate events). Returns null when either part is missing.
function keyOf(e) {
  if (!e || e.summary == null || e.date == null) return null
  return `${e.summary}|${e.date}`
}

/**
 * Index a build-errors.json document into lookup maps for O(1) joins. Tolerates
 * a null/partial document (older builds, fetch failure) by returning empty maps.
 */
export function indexBuildErrors(buildErrors) {
  const idx = {
    bySource: new Map(),         // source name -> sources[] entry (parse/uncertainty errors)
    geocodeBySource: new Map(),  // source name -> [geocodeError]
    proxyBySource: new Map(),    // source name -> pendingProxyVerification entry
    staleBySource: new Map(),    // source name -> proxyStaleServes entry
    uncertainByKey: new Map(),   // eventKey -> uncertainEvent
    costGapByKey: new Map(),     // eventKey -> costGap
    photoGapByKey: new Map(),    // eventKey -> photoGaps.eventGaps entry
    duplicateByKey: new Map(),   // eventKey -> duplicateCandidate
    zeroSet: new Set(),          // calendar names with 0 events (unexpected)
    expectedEmptySet: new Set(), // calendar names with 0 events (expected)
  }
  if (!buildErrors) return idx

  for (const s of buildErrors.sources || []) {
    if (s && s.source != null) idx.bySource.set(s.source, s)
  }
  for (const g of buildErrors.geocodeErrors || []) {
    if (!g || g.source == null) continue
    if (!idx.geocodeBySource.has(g.source)) idx.geocodeBySource.set(g.source, [])
    idx.geocodeBySource.get(g.source).push(g)
  }
  for (const p of buildErrors.pendingProxyVerification || []) {
    if (p && p.name != null) idx.proxyBySource.set(p.name, p)
  }
  for (const p of buildErrors.proxyStaleServes || []) {
    const key = p && (p.name ?? p.source)
    if (key != null) idx.staleBySource.set(key, p)
  }
  for (const u of buildErrors.uncertainEvents || []) {
    const k = keyOf(u && u.event)
    if (k) idx.uncertainByKey.set(k, u)
  }
  for (const c of buildErrors.costGaps || []) {
    const k = keyOf(c)
    if (k) idx.costGapByKey.set(k, c)
  }
  const photoGaps = buildErrors.photoGaps || {}
  for (const e of photoGaps.eventGaps || []) {
    const k = keyOf(e)
    if (k) idx.photoGapByKey.set(k, e)
  }
  for (const d of buildErrors.duplicateCandidates || []) {
    for (const e of (d && d.events) || []) {
      const k = keyOf(e)
      if (k) idx.duplicateByKey.set(k, d)
    }
  }
  for (const n of buildErrors.zeroEventCalendars || []) idx.zeroSet.add(n)
  for (const n of buildErrors.expectedEmptyCalendars || []) idx.expectedEmptySet.add(n)
  return idx
}

// Candidate source-name strings for a channel, most specific first. A ripper's
// build-errors `source` is its ripper name (== channel.ripperName); external /
// recurring sources use the calendar name (channel.cal.name). channel.name is a
// last-ditch fallback. Falsy / duplicate candidates are dropped.
function sourceCandidates(channel) {
  const out = []
  for (const c of [channel?.ripperName, channel?.cal?.name, channel?.name]) {
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

function firstHit(map, candidates) {
  for (const c of candidates) if (map.has(c)) return map.get(c)
  return null
}

/**
 * Build the debug view-model for a venue/source (ChannelDetail). `upcomingCount`
 * is the number of upcoming events the app currently shows for this channel
 * (the panel reports it alongside the build's own counts). Photo / OSM gaps are
 * derived from the channel object itself (more reliable than name-matching the
 * gap queues): a fixed-venue channel with no `imageUrl` has a photo gap; a
 * channel with coordinates but no OSM id has an OSM gap.
 */
export function sourceDebug(index, channel, { upcomingCount = null } = {}) {
  const candidates = sourceCandidates(channel)
  const errEntry = firstHit(index.bySource, candidates)
  const geocodeErrors = []
  for (const c of candidates) {
    if (index.geocodeBySource.has(c)) geocodeErrors.push(...index.geocodeBySource.get(c))
  }
  const zeroEvent = candidates.some(c => index.zeroSet.has(c))
  const expectedEmpty = candidates.some(c => index.expectedEmptySet.has(c))
  const geo = channel?.geo || null
  return {
    sourceKeys: candidates,
    matchedKey: errEntry ? errEntry.source : null,
    icsUrl: channel?.icsUrl ?? null,
    type: channel?.distributed ? 'Distributed (no fixed venue)' : 'Venue',
    upcomingCount,
    parseErrorCount: errEntry?.parseErrorCount ?? errEntry?.errorCount ?? 0,
    uncertaintyCount: errEntry?.uncertaintyCount ?? 0,
    errors: errEntry?.errors ?? [],
    geocodeErrors,
    proxy: firstHit(index.proxyBySource, candidates),
    stale: firstHit(index.staleBySource, candidates),
    zeroEvent,
    expectedEmpty,
    geo,
    hasOsmId: !!(geo && geo.osmId),
    osmGap: !!(geo && !geo.osmId),
    missingPhoto: !channel?.distributed && !channel?.imageUrl,
    imageUrl: channel?.imageUrl ?? null,
  }
}

/**
 * Build the debug view-model for a single event (EventDetail). Reports the raw
 * fields from the events-index entry plus which non-fatal build-health queues
 * the event currently sits in (uncertainty, cost gap, photo gap, duplicate
 * candidate), joined by eventKey.
 */
export function eventDebug(index, event) {
  if (!event) return null
  const key = eventKey(event)
  return {
    eventKey: key,
    id: event.id ?? null,
    icsUrl: event.icsUrl ?? null,
    date: event.date ?? null,
    endDate: event.endDate ?? null,
    location: event.location ?? null,
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    hasCoords: event.lat != null && event.lng != null,
    cost: event.cost ?? null,
    imageUrl: event.imageUrl ?? null,
    url: event.url ?? null,
    uncertainty: event.uncertainty ?? null,
    duplicateOf: event.duplicateOf ?? null,
    dedupedSources: event.dedupedSources ?? null,
    queues: {
      uncertain: index.uncertainByKey.get(key) ?? null,
      costGap: index.costGapByKey.get(key) ?? null,
      photoGap: index.photoGapByKey.get(key) ?? null,
      duplicateCandidate: index.duplicateByKey.get(key) ?? null,
    },
  }
}
