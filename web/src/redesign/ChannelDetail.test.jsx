import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App206Context } from './context.js'
import { ChannelDetail } from './views.jsx'

// A channel event row on the venue/channel detail page is parsed live from the
// ICS (shape: { id, title, startDate, endDate, ... }), but the event detail page
// and deep-linking require the events-index entry (shape: { summary, date,
// icsUrl, ... }). ChannelDetail joins the two by summary + start instant so a row
// can navigate to the detail page. These tests pin that wiring.

const ICS = 'test-ripper-cal1.ics'
// An ISO string with an explicit offset so parseIndexDate(date).date.getTime()
// equals new Date(date).getTime() — the join key both sides compute.
const ISO = '2099-09-15T19:00:00-08:00'
const START = new Date(ISO)
const END = new Date('2099-09-15T21:00:00-08:00')

// The events-index entry the row should open. `cost` drives the price label.
const indexEvent = {
  icsUrl: ICS, summary: 'Jazz Night', description: 'Live jazz',
  location: 'Neumos', date: ISO, cost: { min: 0, paid: false },
}

const channel = {
  name: 'Neumos', color: '#c33', primaryCategory: 'Music',
  distributed: false, hood: 'Capitol Hill', tags: [],
  geo: null, imageUrl: undefined, description: undefined, website: undefined,
  cal: { icsUrl: ICS, originalIcsUrl: ICS, rssUrl: undefined },
}

function makeModel(overrides = {}) {
  const openEvent = vi.fn()
  const model = {
    openEvent,
    back: vi.fn(),
    flash: vi.fn(),
    openFeedback: vi.fn(),
    toggleFollow: vi.fn(),
    setNeighborhood: vi.fn(),
    setCategory: vi.fn(),
    go: vi.fn(),
    createWebcalUrl: () => '#',
    createGoogleCalendarUrl: () => '#',
    createHttpsUrl: () => '#',
    calendarAddMode: 'download',
    favoritesSet: new Set(),
    channelByIcsUrl: new Map([[ICS, channel]]),
    eventsByIcsUrl: new Map([[ICS, [indexEvent]]]),
    channelEventsLoading: false,
    channelEventsError: null,
    channelEvents: [
      { id: 'jazz-night', title: 'Jazz Night', startDate: START, endDate: END, description: 'Live jazz', location: 'Neumos' },
    ],
    ...overrides,
  }
  return { model, openEvent }
}

function renderChannel(overrides) {
  const { model, openEvent } = makeModel(overrides)
  render(
    <App206Context.Provider value={model}>
      <ChannelDetail icsUrl={ICS} />
    </App206Context.Provider>
  )
  return { openEvent }
}

describe('ChannelDetail event rows', () => {
  it('opens the matching events-index entry when a row is clicked', () => {
    const { openEvent } = renderChannel()
    const row = screen.getByText('Jazz Night').closest('.ev')
    fireEvent.click(row)
    expect(openEvent).toHaveBeenCalledTimes(1)
    // It must hand EventDetail the INDEX entry (summary/date/icsUrl), not the
    // ICS-parsed event (title/startDate).
    const arg = openEvent.mock.calls[0][0]
    expect(arg.summary).toBe('Jazz Night')
    expect(arg.date).toBe(ISO)
    expect(arg.icsUrl).toBe(ICS)
  })

  it('does not navigate when the Add-to-Calendar control is clicked', () => {
    const { openEvent } = renderChannel()
    fireEvent.click(document.querySelector('.add-to-cal-btn'))
    expect(openEvent).not.toHaveBeenCalled()
  })

  it('does not navigate when the location map link is clicked', () => {
    const distributedChannel = { ...channel, distributed: true }
    const { openEvent } = renderChannel({
      channelByIcsUrl: new Map([[ICS, distributedChannel]]),
      channelEvents: [
        { id: 'jazz-night', title: 'Jazz Night', startDate: START, endDate: END, location: 'Neumos, Capitol Hill' },
      ],
    })
    const mapLink = screen.getByLabelText('Open in maps')
    fireEvent.click(mapLink)
    expect(openEvent).not.toHaveBeenCalled()
  })

  it('renders an inert row (no nav) when no index entry matches', () => {
    const { openEvent } = renderChannel({
      // Index has a different summary, so the join misses.
      eventsByIcsUrl: new Map([[ICS, [{ ...indexEvent, summary: 'Different Show' }]]]),
    })
    const row = screen.getByText('Jazz Night').closest('.ev')
    fireEvent.click(row)
    expect(openEvent).not.toHaveBeenCalled()
  })
})
