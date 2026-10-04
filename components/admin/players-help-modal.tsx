'use client'

import { useState } from 'react'
import { Overlay } from '@/components/ui/overlay'

const ROLES = [
  {
    name: 'Org Admin',
    badge: 'bg-purple-100 text-purple-700',
    description: 'Full access to the entire admin panel — events, payments, settings, billing, and member management. Can change any other member\'s role.',
  },
  {
    name: 'League Admin',
    badge: 'bg-blue-100 text-blue-700',
    description: 'Access to assigned events only: schedule, teams, scores, and players within their leagues. Cannot access org settings, payments, or member management.',
  },
  {
    name: 'Captain',
    badge: 'bg-orange-100 text-orange-700',
    description: 'Player-facing access only. Can manage their own team roster, submit scores, and confirm opponent scores. No admin panel access.',
  },
  {
    name: 'Player',
    badge: 'bg-gray-100 text-gray-600',
    description: 'Standard player access. Can view schedule, standings, and register for events. No admin or team-management access.',
  },
]

const ACTIONS = [
  {
    label: 'Change role',
    color: 'text-gray-700',
    description: 'Click the role badge on any row to open a dropdown and select a new role. Takes effect immediately. You cannot change your own role.',
  },
  {
    label: 'Suspend',
    color: 'text-red-600',
    description: 'Soft-blocks the member. Admins and League Admins lose panel access immediately. Player-facing pages (schedule, standings) remain accessible. Team memberships and registrations are untouched. Fully reversible.',
  },
  {
    label: 'Reinstate',
    color: 'text-green-600',
    description: 'Restores a suspended member to Active status. All previous access is immediately restored.',
  },
  {
    label: 'Delete',
    color: 'text-red-700',
    description: 'Permanent and irreversible. Removes the member from this org and all teams within it. If they belong to no other orgs, their account is deleted so they can re-register with the same email.',
  },
]

export function PlayersHelpModal() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        // 40px tap area around the small ? badge (it was a 20px target).
        className="press inline-flex items-center justify-center min-h-10 min-w-10 -m-2.5 rounded-full text-gray-500 hover:text-gray-700"
        aria-label="Player roles and actions guide"
        title="Roles & actions guide"
      >
        <span aria-hidden className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-[11px] font-bold leading-none">?</span>
      </button>

      {/* Shared Overlay: scroll lock, Escape, focus trap; a sheet on phones. */}
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        variant="sheet"
        labelledBy="players-help-title"
        panelClassName="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto"
      >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 id="players-help-title" className="font-semibold text-gray-900">Player Roles & Actions</h2>
              <button
                onClick={() => setOpen(false)}
                className="press -mr-2 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">

              {/* Roles */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Roles</h3>
                <div className="space-y-3">
                  {ROLES.map((r) => (
                    <div key={r.name} className="flex gap-3">
                      <span className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium h-fit ${r.badge}`}>
                        {r.name}
                      </span>
                      <p className="text-sm text-gray-600 leading-snug">{r.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <hr />

              {/* Actions */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Actions</h3>
                <div className="space-y-3">
                  {ACTIONS.map((a) => (
                    <div key={a.label} className="flex gap-3">
                      <span className={`shrink-0 mt-0.5 text-xs font-semibold w-16 ${a.color}`}>
                        {a.label}
                      </span>
                      <p className="text-sm text-gray-600 leading-snug">{a.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <hr />

              {/* Note on suspension */}
              <section className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">Note on Suspension</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Suspension removes admin panel access but does not prevent a player from
                  viewing public pages like the schedule or standings. To fully remove someone,
                  use <span className="font-semibold">Delete</span>.
                </p>
              </section>

            </div>
      </Overlay>
    </>
  )
}
