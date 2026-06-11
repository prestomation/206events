// Channel (calendar/source) card: avatar, name, "N upcoming · hood", a Follow
// pill, and a peek of the next two upcoming events.

import { useApp206 } from './context.js'
import { ChannelAvatar, CatDot, FollowPill } from './atoms.jsx'
import cityConfig from '../../../city.config.ts'

export function ChannelCard({ channel }) {
  const app = useApp206()
  const following = app.favoritesSet.has(channel.icsUrl)
  const sub = channel.distributed ? 'Citywide' : (channel.hood || cityConfig.city.name)
  return (
    <div className="ch" onClick={() => app.openChannel(channel.icsUrl)}>
      <div className="ch-top">
        <ChannelAvatar color={channel.color} />
        <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
          <div className="ch-name">{channel.name}</div>
          <div className="mk-tag" style={{ marginTop: 3, color: 'var(--ink-3)', display: 'flex', minWidth: 0 }}>
            <CatDot tag={channel.primaryCategory} color={channel.color} size={7} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {channel.upcomingCount} upcoming · {sub}
            </span>
          </div>
        </div>
        <FollowPill on={following} onClick={() => app.toggleFollow(channel.icsUrl)} />
      </div>
      {channel.peek.length > 0 && (
        <div className="ch-peek">
          {channel.peek.map((event, i) => (
            <div className="row" key={i}>
              <span className="d">{event.dateNum}</span>
              <span className="t">{event.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
