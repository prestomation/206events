// First-time user experience: a dismissible welcome card shown on a clean cold
// load, and an always-available "How it works" help modal. Both are
// explain-only — they never write to the user's favorites / search / geo state.

import { Ico } from './icons.jsx'
import { useApp206 } from './context.js'
import { Modal } from './atoms.jsx'
import cityConfig from '../../../city.config.ts'

// The welcome card only appears on a plain Discover entry — never when the
// initial URL deep-links into a specific event/channel, another section, or a
// pre-applied search/filter (those are intentional landings, e.g. shared links).
export function isCleanColdLoad(initialUrl) {
  return initialUrl.section === 'discover' && !initialUrl.channel &&
    !initialUrl.event && !initialUrl.q && !initialUrl.category && !initialUrl.neighborhood
}

// The three steps that turn the site from "a wall of events" into "events in
// my own calendar app". Shared by the welcome card.
const STEPS = [
  { icon: Ico.grid, title: 'Browse', body: `Every ${cityConfig.city.name} event from ~300 venues and organizations, in one place.` },
  { icon: Ico.heart, title: 'Follow what you like', body: 'Calendars, neighborhoods, or saved searches build a personal feed.' },
  { icon: Ico.cal, title: 'Subscribe once', body: 'Add a single feed to Google, Apple, or Outlook — it updates itself.' },
]

export function WelcomeModal() {
  const app = useApp206()
  if (!app.showWelcome) return null
  const footer = (
    <>
      <button className="btn btn-ghost" onClick={() => { app.dismissWelcome(); app.openHelp() }}>
        How it works
      </button>
      <button className="btn btn-blue" onClick={app.dismissWelcome}>
        {Ico.spark}Start browsing
      </button>
    </>
  )
  return (
    <Modal title={`Every ${cityConfig.city.name} event, one place`} onClose={app.dismissWelcome} footer={footer}
      labelledBy="a-welcome-title">
      <p className="a-dlg-lead">
        {cityConfig.site.name} gathers events from across {cityConfig.city.name} so you can find what’s on —
        browse it all right here, or pipe it straight into the calendar app you
        already use.
      </p>
      <ol className="a-onboard-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <span className="a-onboard-ico">{s.icon}</span>
            <div>
              <div className="a-onboard-step-title">{s.title}</div>
              <div className="a-onboard-step-body">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  )
}

export function HelpModal() {
  const app = useApp206()
  if (!app.helpOpen) return null
  return (
    <Modal title={`How ${cityConfig.site.name} works`} onClose={app.closeHelp} labelledBy="a-help-title">
      <p className="a-dlg-lead">
        Everything here is a calendar feed. There are three ways to use it —
        pick whichever fits how you keep track of things.
      </p>

      <div className="a-help-section">
        <div className="a-help-h"><span className="a-onboard-ico">{Ico.grid}</span>Subscribe to a topic or neighborhood</div>
        <p>
          In <b>Discover</b>, filter by a category (Music, Markets, Comedy…) or a
          neighborhood. Each one is its own feed you can subscribe to — e.g. all
          Capitol Hill events in a single calendar.
        </p>
      </div>

      <div className="a-help-section">
        <div className="a-help-h"><span className="a-onboard-ico">{Ico.heart}</span>Build a personal feed</div>
        <p>
          Follow individual calendars, save a search that keeps matching new
          events, or save a map area to pull in everything nearby. They combine
          into your <b>Following</b> feed, available as one subscribable link.
        </p>
      </div>

      <div className="a-help-section">
        <div className="a-help-h"><span className="a-onboard-ico">{Ico.plus}</span>Add a single event</div>
        <p>
          Just want one thing on your calendar? Use the {''}
          <span className="a-help-inline">{Ico.cal}</span> button on any event to
          add it to Google Calendar or download an <code>.ics</code> file.
        </p>
      </div>

      <div className="a-help-section">
        <div className="a-help-h"><span className="a-onboard-ico">{Ico.cal}</span>Subscribing in your calendar app</div>
        <p>
          A subscription stays up to date automatically. In <b>Google
          Calendar</b>: Other calendars → From URL. In <b>Apple Calendar</b>:
          File → New Calendar Subscription. In <b>Outlook</b>: Add calendar →
          Subscribe from web.
        </p>
      </div>
    </Modal>
  )
}
