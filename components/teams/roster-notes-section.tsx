'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { addRosterNote, updateRosterNote, deleteRosterNote, type RosterNote } from '@/actions/roster-notes'
import { sendTeamInvite } from '@/actions/invitations'

interface Props {
  teamId: string
  initialNotes: RosterNote[]
  /** League slug — used to construct the registration link in the invite */
  leagueSlug: string | null
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ── Inline edit row ────────────────────────────────────────────────────────────

function EditRow({
  note,
  teamId,
  onSave,
  onCancel,
}: {
  note: Partial<RosterNote> & { id?: string }
  teamId: string
  onSave: (updated: RosterNote) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(note.name ?? '')
  const [email, setEmail] = useState(note.email ?? '')
  const [noteText, setNoteText] = useState(note.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (email.trim() && !isValidEmail(email.trim())) { setError('Enter a valid email or leave it blank'); return }

    setError(null)
    startTransition(async () => {
      if (note.id) {
        const result = await updateRosterNote({ id: note.id, teamId, name, email, note: noteText })
        if (result.error) { setError(result.error); return }
        onSave({ id: note.id, name: name.trim(), email: email.trim() || null, note: noteText.trim() || null, created_at: note.created_at ?? new Date().toISOString() })
      } else {
        const result = await addRosterNote({ teamId, name, email, note: noteText })
        if (result.error) { setError(result.error); return }
        if (result.data) onSave(result.data)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onCancel()
  }

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 bg-white'
  const ringStyle = { '--tw-ring-color': 'var(--brand-primary)' } as React.CSSProperties

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50 space-y-2.5">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Name <span className="text-red-400">*</span></label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Full name"
          maxLength={120}
          className={inputClass}
          style={ringStyle}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Email <span className="text-gray-400 font-normal">(optional — enables Invite)</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="player@example.com"
          className={inputClass}
          style={ringStyle}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Note <span className="text-gray-400 font-normal">(optional)</span></label>
        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. jersey #7, position OH, needs to sign waiver"
          maxLength={500}
          className={inputClass}
          style={ringStyle}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-600 border hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Note row ───────────────────────────────────────────────────────────────────

function NoteRow({
  note,
  teamId,
  onUpdate,
  onDelete,
}: {
  note: RosterNote
  teamId: string
  onUpdate: (updated: RosterNote) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const [invitePending, startInvite] = useTransition()

  function handleDelete() {
    if (!confirm(`Remove "${note.name}" from the planning list?`)) return
    startDelete(async () => {
      await deleteRosterNote(note.id, teamId)
      onDelete(note.id)
    })
  }

  function handleInvite() {
    if (!note.email) return
    setInviteError(null)
    setInviting(true)
    startInvite(async () => {
      const result = await sendTeamInvite({ teamId, email: note.email!, role: 'player' })
      setInviting(false)
      if (result.error) {
        setInviteError(result.error)
      } else {
        setInviteSuccess(true)
      }
    })
  }

  if (editing) {
    return (
      <EditRow
        note={note}
        teamId={teamId}
        onSave={(updated) => { onUpdate(updated); setEditing(false) }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="py-3 border-b last:border-0">
      <div className="flex items-start gap-3">
        {/* Avatar placeholder */}
        <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-xs text-gray-400">?</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">{note.name}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 uppercase tracking-wide">
              Unregistered
            </span>
          </div>
          {note.email && !inviteSuccess && (
            <p className="text-xs text-gray-400 mt-0.5">{note.email}</p>
          )}
          {note.note && (
            <p className="text-xs text-gray-500 mt-0.5 italic">{note.note}</p>
          )}
          {inviteSuccess && (
            <p className="text-xs text-green-600 mt-0.5 font-medium">✓ Invite sent to {note.email}</p>
          )}
          {inviteError && (
            <p className="text-xs text-red-500 mt-0.5">{inviteError}</p>
          )}
        </div>
      </div>

      {/* Actions — always visible, full-width row on mobile */}
      <div className="flex items-center gap-2 mt-2 ml-11">
        {note.email && !inviteSuccess && (
          <button
            type="button"
            onClick={handleInvite}
            disabled={invitePending || inviting}
            className="flex-1 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {invitePending || inviting ? 'Sending…' : 'Send Invite'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${note.email && !inviteSuccess ? '' : 'flex-1'} py-1.5 px-3 rounded-md text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="py-1.5 px-3 rounded-md text-xs font-medium text-red-500 border border-red-100 hover:bg-red-50 disabled:opacity-40 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RosterNotesSection({ teamId, initialNotes }: Props) {
  const [notes, setNotes] = useState<RosterNote[]>(initialNotes)
  const [adding, setAdding] = useState(false)

  function handleAdd(newNote: RosterNote) {
    setNotes((prev) => [...prev, newNote])
    setAdding(false)
  }

  function handleUpdate(updated: RosterNote) {
    setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n))
  }

  function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="mt-4 bg-white rounded-lg border">
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-sm text-gray-700">Planning</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Track who you expect to join — not registered members.
            </p>
          </div>
          {!adding && notes.length < 50 && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              + Add person
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pb-4">
        {notes.length === 0 && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full mt-1 py-3 rounded-lg border border-dashed border-gray-200 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
          >
            + Add your first planning entry
          </button>
        )}

        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            teamId={teamId}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}

        {adding && (
          <div className="mt-2">
            <EditRow
              note={{}}
              teamId={teamId}
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
