'use client'

import { useState, type ComponentProps } from 'react'
import { Plus, X } from 'lucide-react'
import { Overlay } from '@/components/ui/overlay'
import { AdminCreateTeamForm } from './admin-create-team-form'

/**
 * Phones: "+ New team" at the top of an event's Teams page, opening the form
 * in a sheet. The sidebar form renders after every team card on a phone —
 * creating a team meant scrolling the whole list. Desktop keeps the sidebar.
 * (Same pattern as AddGameSheetButton on the schedule.)
 */
export function CreateTeamSheetButton(props: Omit<ComponentProps<typeof AdminCreateTeamForm>, 'onCreated'>) {
  const [open, setOpen] = useState(false)
  // Remount per open so a half-filled team doesn't linger.
  const [session, setSession] = useState(0)

  return (
    <>
      <button
        type="button"
        onClick={() => { setSession((n) => n + 1); setOpen(true) }}
        className="press inline-flex items-center gap-1.5 min-h-10 px-4 rounded-lg border bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        <Plus className="w-4 h-4" aria-hidden /> New team
      </button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        variant="sheet"
        label="Add team"
        panelClassName="w-full sm:max-w-md bg-gray-50 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex justify-end px-2 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="press inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-3 pb-3">
          {session > 0 && <AdminCreateTeamForm key={session} {...props} onCreated={() => setOpen(false)} />}
        </div>
      </Overlay>
    </>
  )
}
