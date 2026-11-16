'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { setMediaAutoApprove } from '@/actions/event-media'
import { safeAction } from '@/lib/action-errors'

/**
 * "Publish uploads straight away" — on tournament day nobody has time to
 * approve photos, and a photo that doesn't reach the TV within a minute stops
 * people uploading. Admins can still hide or delete anything afterwards.
 */
export function MediaAutoApproveToggle({ leagueId, initial }: { leagueId: string; initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function flip() {
    const next = !on
    setOn(next)
    setBusy(true)
    const res = await safeAction(setMediaAutoApprove(leagueId, next))
    setBusy(false)
    if (res.error) {
      setOn(!next)
      toast.error(res.error)
      return
    }
    toast.success(next ? 'Uploads now go live straight away' : 'Uploads wait for approval again')
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${on ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Publish uploads straight away"
        disabled={busy}
        onClick={flip}
        className={`press relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-emerald-600' : 'bg-gray-300'}`}
      >
        <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-gray-900">Publish uploads straight away</p>
        <p className="text-gray-600">
          {on
            ? 'Player photos go to the gallery and the TV as soon as they’re uploaded, with the uploader’s name on screen. Hide or delete anything below.'
            : 'Turn on for game day: player photos skip the approval queue and reach the TV within a minute. You can still hide or delete anything.'}
        </p>
      </div>
    </div>
  )
}
