'use client'

import { useEffect, useState } from 'react'
import { inLiveWindow } from '@/lib/live-window'
import { LiveScoreBadge } from './live-score-badge'

/**
 * Mounts LiveScoreBadge (and with it the Realtime subscription) only once the
 * game is inside its live window — re-checked every minute, so a page left
 * open from the afternoon picks the game up when it starts. Server pages pass
 * only rows that may go live soon (`mayGoLiveSoon`).
 */
export function LiveScoreBadgeWhenLive({ leagueId, gameId, scheduledAt }: { leagueId: string; gameId: string; scheduledAt: string }) {
  const [live, setLive] = useState(false)
  useEffect(() => {
    const check = () => setLive(inLiveWindow(scheduledAt, Date.now()))
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [scheduledAt])
  return live ? <LiveScoreBadge leagueId={leagueId} gameId={gameId} /> : null
}
