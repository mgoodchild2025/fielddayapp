'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Overlay } from '@/components/ui/overlay'
import { Plus, X } from 'lucide-react'
import { adminAddRegistrant } from '@/actions/registrations'

type Method = 'cash' | 'etransfer' | 'cheque' | 'card' | 'other'

interface SessionOption { id: string; label: string }

export function AdminAddRegistrant({
  leagueId,
  sessions = [],
  defaultSessionId,
  triggerLabel = 'Add registrant',
  triggerClassName,
  canRecordPayment = false,
}: {
  leagueId: string
  sessions?: SessionOption[]
  /** Preselect a session (e.g. adding to a specific session). */
  defaultSessionId?: string
  triggerLabel?: string
  triggerClassName?: string
  /** Org admins can record what the registrant paid; league admins can't. */
  canRecordPayment?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [notes, setNotes] = useState('')
  // '' = all sessions (full pass); otherwise a specific session id.
  const [sessionId, setSessionId] = useState(defaultSessionId ?? '')

  const hasSessions = sessions.length > 0

  function close() {
    setOpen(false)
    setFullName(''); setEmail(''); setPhone(''); setAmount(''); setMethod('cash'); setNotes(''); setSessionId(defaultSessionId ?? '')
    setError(null)
  }

  function submit() {
    if (!fullName.trim()) { setError('Name is required.'); return }
    const cents = canRecordPayment && amount.trim() ? Math.round(parseFloat(amount) * 100) : 0
    if (isNaN(cents) || cents < 0) { setError('Enter a valid amount (or leave blank).'); return }
    setError(null)
    startTransition(async () => {
      const res = await adminAddRegistrant({
        leagueId,
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        amountCents: cents,
        method,
        notes: canRecordPayment ? notes.trim() || undefined : undefined,
        sessionId: sessionId || undefined,
      })
      if (res.error) { setError(res.error); return }
      close()
      router.refresh()
    })
  }

  const trigger = (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white'}
        style={triggerClassName ? undefined : { backgroundColor: 'var(--brand-primary)' }}
      >
        <Plus className="w-4 h-4" /> {triggerLabel}
      </button>
  )

  // Shared Overlay: a sheet on phones, scroll lock, Escape, focus trap.
  return (
    <>
    {trigger}
    <Overlay
      open={open}
      onClose={close}
      variant="sheet"
      labelledBy="add-registrant-title"
      panelClassName="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-h-[92dvh] overflow-y-auto"
    >
      <div>
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 id="add-registrant-title" className="text-base font-semibold text-gray-900">Add registrant</h2>
          <button type="button" onClick={close} className="press -mr-2 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:text-gray-700" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full name <span className="text-red-400">*</span></label>
            <input data-autofocus value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Jane Doe" />
          </div>

          {hasSessions && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Session</label>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full border rounded-md px-2 py-2 text-sm bg-white">
                <option value="">All sessions (full pass)</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                {sessionId
                  ? 'Counts toward this session only.'
                  : 'Counts toward every session — including ones you add later.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email <span className="text-gray-400">(optional)</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="—" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone <span className="text-gray-400">(optional)</span></label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="—" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">
            With an email, we create them a claimable account. Without one, they&rsquo;re added as a guest.
          </p>

          {canRecordPayment && (<>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Amount paid <span className="text-gray-400">(optional)</span></label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border rounded-md pl-6 pr-3 py-2 text-sm" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="w-full border rounded-md px-2 py-2 text-sm bg-white">
                <option value="cash">Cash</option>
                <option value="etransfer">e-Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card (in person)</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. paid cash at the desk" />
          </div>
          </>)}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5">
          <button type="button" onClick={close} className="px-3 py-1.5 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={submit} disabled={pending} className="px-3.5 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
            {pending ? 'Adding…' : 'Add registrant'}
          </button>
        </div>
      </div>
    </Overlay>
    </>
  )
}
