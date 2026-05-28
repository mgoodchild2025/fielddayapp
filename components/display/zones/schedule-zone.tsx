import type { DisplayGame, ZoneConfig } from '@/lib/display-types'
import { ScheduleClient } from './schedule-zone-client'

interface Props {
  games:    DisplayGame[]
  config:   Extract<ZoneConfig, { type: 'schedule' }>
  timezone: string
  theme:    'dark' | 'light'
  pools:    { id: string; name: string }[]
}

export function ScheduleZone({ games, config, timezone, theme, pools }: Props) {
  const isDark = theme === 'dark'

  // Filter by pool if configured
  const filtered = config.pool_id
    ? games.filter((g) => g.pool_id === config.pool_id)
    : games

  // Filter by court if configured
  const visible = config.court_filter
    ? filtered.filter((g) => g.court === config.court_filter)
    : filtered

  const poolName = config.pool_id
    ? pools.find((p) => p.id === config.pool_id)?.name
    : null

  const headerText = poolName
    ? `Schedule — ${poolName}`
    : config.court_filter
    ? `Schedule — ${config.court_filter}`
    : 'Schedule'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Zone header */}
      <div className={`px-4 py-2 shrink-0 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          {headerText}
        </h2>
      </div>

      {visible.length === 0 ? (
        <div className={`flex items-center justify-center flex-1 text-lg ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          No games scheduled
        </div>
      ) : (
        <ScheduleClient games={visible} timezone={timezone} isDark={isDark} />
      )}
    </div>
  )
}
