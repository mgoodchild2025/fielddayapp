'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { adminAddRegistrant } from '@/actions/registrations'

type Method = 'cash' | 'etransfer' | 'cheque' | 'card' | 'other'

export function AdminAddRegistrant({ leagueId }: { leagueId: string }) {
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

  function close() {
    setOpen(false)
    setFullName(''); setEmail(''); setPhone(''); setAmount(''); setMethod('cash'); setNotes('')
    setError(null)
  }

  function submit() {
    if (!fullName.trim()) { setError('Name is required.'); return }
    const cents = amount.trim() ? Math.round(parseFloat(amount) * 100) : 0
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
        notes: notes.trim() || undefined,
      })
      if (res.error) { setError(res.error); return }
      close()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        <Plus className="w-4 h-4" /> Add registrant
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl my-auto">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-base font-semibold text-gray-900">Add registrant</h2>
          <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full name <span className="text-red-400">*</span></label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Jane Doe" />
          </div>

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

          <div className="grid grid-cols-2 gap-2 pt-1 border-t">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Amount paid <span className="text-gray-400">(optional)</span></label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border rounded-md pl-6 pr-3 py-2 text-sm" placeholder="0.00" />
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
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5">
          <button type="button" onClick={close} className="px-3 py-1.5 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={submit} disabled={pending} className="px-3.5 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
            {pending ? 'Adding…' : 'Add registrant'}
          </button>
        </div>
      </div>
    </div>
  )
}
