import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UncertaintyBadge, uncertainFieldsFor, eventUncertainty } from './atoms.jsx'

// The events-index `uncertainty` field is the structured replacement for the
// old raw "⚠️ …" description line. These tests pin the badge wording per kind
// and the field-routing helper that decides which fact shows the badge.

describe('eventUncertainty', () => {
  it('returns null when the field is absent or empty', () => {
    expect(eventUncertainty(undefined)).toBeNull()
    expect(eventUncertainty({})).toBeNull()
    expect(eventUncertainty({ uncertainty: { fields: [], kind: 'pending' } })).toBeNull()
  })

  it('rejects an unknown kind', () => {
    expect(eventUncertainty({ uncertainty: { fields: ['cost'], kind: 'bogus' } })).toBeNull()
  })

  it('normalizes fields into a Set with the kind', () => {
    const u = eventUncertainty({ uncertainty: { fields: ['startTime', 'cost'], kind: 'pending' } })
    expect(u.kind).toBe('pending')
    expect([...u.fields].sort()).toEqual(['cost', 'startTime'])
  })
})

describe('uncertainFieldsFor', () => {
  const event = { uncertainty: { fields: ['startTime', 'cost'], kind: 'unresolvable' } }
  it('returns only the candidate fields the event is uncertain about', () => {
    expect(uncertainFieldsFor(event, ['startTime', 'duration'])).toEqual(['startTime'])
    expect(uncertainFieldsFor(event, ['cost'])).toEqual(['cost'])
    expect(uncertainFieldsFor(event, ['location'])).toEqual([])
  })
  it('returns [] when the event has no uncertainty', () => {
    expect(uncertainFieldsFor({}, ['startTime'])).toEqual([])
  })
})

describe('UncertaintyBadge', () => {
  it('renders nothing when there are no relevant fields', () => {
    const { container } = render(
      <UncertaintyBadge event={{ uncertainty: { fields: ['cost'], kind: 'pending' } }} fields={[]} />,
    )
    expect(container.querySelector('.uncertain-badge')).toBeNull()
  })

  it('always shows a "?" mark (never a tilde), for both kinds', () => {
    const { rerender, container } = render(
      <UncertaintyBadge event={{ uncertainty: { fields: ['startTime'], kind: 'pending' } }} fields={['startTime']} />,
    )
    expect(container.querySelector('.uncertain-badge-mark').textContent).toBe('?')
    rerender(
      <UncertaintyBadge event={{ uncertainty: { fields: ['startTime'], kind: 'unresolvable' } }} fields={['startTime']} />,
    )
    expect(container.querySelector('.uncertain-badge-mark').textContent).toBe('?')
  })

  it('reads as "approximate" for the pending kind', () => {
    render(
      <UncertaintyBadge
        event={{ uncertainty: { fields: ['startTime'], kind: 'pending' } }}
        fields={['startTime']}
      />,
    )
    const badge = screen.getByText('approximate').closest('.uncertain-badge')
    expect(badge).toHaveClass('uncertain-badge--pending')
    expect(badge.tagName).toBe('BUTTON')
    expect(badge.getAttribute('title')).toMatch(/approximate — our automated check/)
  })

  it('reads as "unverified" for the unresolvable kind', () => {
    render(
      <UncertaintyBadge
        event={{ uncertainty: { fields: ['startTime', 'duration'], kind: 'unresolvable' } }}
        fields={['startTime', 'duration']}
      />,
    )
    const badge = screen.getByText('unverified').closest('.uncertain-badge')
    expect(badge).toHaveClass('uncertain-badge--unresolvable')
    expect(badge.getAttribute('title')).toMatch(/Start time & Duration were not posted by the source/)
  })

  it('opens a popup with the explanation on click and closes on a second click', () => {
    render(
      <UncertaintyBadge
        event={{ uncertainty: { fields: ['duration'], kind: 'unresolvable' } }}
        fields={['duration']}
      />,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    const pop = screen.getByRole('tooltip')
    expect(pop).toHaveTextContent(/Duration was not posted by the source/)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hides the text label in compact mode but keeps the popup explanation', () => {
    render(
      <UncertaintyBadge
        event={{ uncertainty: { fields: ['cost'], kind: 'pending' } }}
        fields={['cost']}
        compact
      />,
    )
    expect(screen.queryByText('approximate')).toBeNull()
    const badge = document.querySelector('.uncertain-badge')
    expect(badge.getAttribute('title')).toMatch(/Price is approximate/)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Price is approximate/)
  })
})
