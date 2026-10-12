'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { forgetStaleDoors, openDoorScreen } from './app-alerts'

export type CourtsideDoor = { id: string; name: string; isArmed: boolean; locationLabel: string | null; displayIds: string[] }

/**
 * Courtside's door shortcuts: each door opens its display screen on this
 * device in one tap (pairing it the first time, no code), with a way back.
 */
export function CourtsideDoors({ doors, from }: { doors: CourtsideDoor[]; from: string }) {
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    forgetStaleDoors(Object.fromEntries(doors.map((d) => [d.id, d.displayIds])))
  }, [doors])

  async function open(id: string) {
    setBusy(id)
    const res = await openDoorScreen(id, from)
    if (!res.ok) {
      setBusy(null)
      toast.error(res.error)
    }
  }

  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Door alert</p>
      <div className="flex flex-wrap gap-2">
        {doors.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void open(d.id)}
            className="press inline-flex items-center gap-2 min-h-11 px-4 rounded-full border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${d.isArmed ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <span className="truncate max-w-[14rem]">{busy === d.id ? 'Opening…' : d.name}</span>
            <span className="sr-only">{d.isArmed ? '(on)' : '(off)'}, open the door screen</span>
          </button>
        ))}
      </div>
    </div>
  )
}
