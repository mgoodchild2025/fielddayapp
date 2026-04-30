'use client'

import { useState, useTransition } from 'react'
import { checkInByToken, undoCheckIn } from '@/actions/checkin'

interface Registration {
  id: string
  playerName: string
  teamName: string | null
  checkinToken: string
  checkedInAt: string | null
}

interface Props {
  registrations: Registration[]
  leagueId: string
}

function CheckInRow({ reg, leagueId }: { reg: Registration; leagueId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCheckIn() {
    setError(null)
    startTransition(async () => {
      const result = await checkInByToken(reg.checkinToken, leagueId)
      if (result.status === 'not_found') setError('Token not found')
      else if (result.status === 'unauthorized') setError('Not authorised')
    })
  }

  function handleUndo() {
    setError(null)
    startTransition(async () => {
      const result = await undoCheckIn(reg.id, leagueId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <tr className={`border-b last:border-0 ${isPending ? 'opacity-50' : ''}`} title={error ?? undefined}>
      <td className="px-4 py-3">
        <div className="font-medium">{reg.playerName}</div>
        {reg.teamName && <div className="text-xs text-gray-400">{reg.teamName}</div>}
      </td>
      <td className="px-4 py-3">
        {reg.checkedInAt ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            ✓ Checked in
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Not checked in
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {reg.checkedInAt
          ? new Date(reg.checkedInAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
          : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {reg.checkedInAt ? (
          <button
            onClick={handleUndo}
            disabled={isPending}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
          >
            Undo
          </button>
        ) : (
          <button
            onClick={handleCheckIn}
            disabled={isPending}
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            Check in
          </button>
        )}
      </td>
    </tr>
  )
}

export function CheckInList({ registrations, leagueId }: Props) {
  const checkedInCount = registrations.filter((r) => r.checkedInAt).length

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {checkedInCount} / {registrations.length} checked in
      </p>
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Player</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Time</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((reg) => (
                <CheckInRow key={reg.id} reg={reg} leagueId={leagueId} />
              ))}
              {registrations.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                    No registrations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
