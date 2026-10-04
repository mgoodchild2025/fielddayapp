'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminAddInterest, adminRemoveInterest, adminSetInterestUnsubscribed } from '@/actions/event-interest'

export interface InterestRow {
  id: string
  name: string | null
  email: string
  created_at: string
  notified_at: string | null
  unsubscribed_at: string | null
}

function statusOf(r: InterestRow): { label: string; cls: string } {
  if (r.unsubscribed_at) return { label: 'Unsubscribed', cls: 'bg-gray-100 text-gray-500' }
  if (r.notified_at) return { label: 'Notified on open', cls: 'bg-green-100 text-green-700' }
  return { label: 'Awaiting open', cls: 'bg-amber-100 text-amber-700' }
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function EventInterestManager({
  leagueId,
  rows,
  timezone,
}: {
  leagueId: string
  rows: InterestRow[]
  timezone?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', ...(timezone ? { timeZone: timezone } : {}) })

  const activeCount = rows.filter((r) => !r.unsubscribed_at).length

  function run(fn: () => Promise<{ error: string | null }>, id?: string) {
    setError(null)
    if (id) setBusyId(id)
    startTransition(async () => {
      const res = await fn()
      setBusyId(null)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addEmail.trim()) { setError('Enter an email.'); return }
    run(async () => {
      const res = await adminAddInterest(leagueId, addEmail.trim(), addName.trim() || undefined)
      if (!res.error) { setAddEmail(''); setAddName(''); setAdding(false) }
      return res
    })
  }

  function exportCsv() {
    const header = ['Name', 'Email', 'Signed up', 'Status']
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push([
        csvCell(r.name ?? ''),
        csvCell(r.email),
        csvCell(fmtDate(r.created_at)),
        csvCell(statusOf(r).label),
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'notify-me-list.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Notify-me list</h3>
          <p className="text-xs text-gray-500">{rows.length} total · {activeCount} active</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding((v) => !v)}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {adding ? 'Cancel' : '+ Add'}
          </button>
          {rows.length > 0 && (
            <button onClick={exportCsv} className="px-3 py-1.5 rounded-md text-sm font-medium border text-gray-600 hover:bg-gray-50">
              Export CSV
            </button>
          )}
        </div>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 bg-gray-50 border rounded-lg p-3">
          <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name (optional)" className="flex-1 border rounded-md px-3 py-2 text-sm" />
          <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="email@example.com" className="flex-1 border rounded-md px-3 py-2 text-sm" />
          <button type="submit" disabled={pending} className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>Add</button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <div className="bg-white border rounded-lg px-6 py-10 text-center text-gray-500 text-sm">
          No one has signed up to be notified yet.
        </div>
      ) : (
        <div className="sm:overflow-x-auto border rounded-lg">
          <table className="w-full text-sm max-sm:block">
            <thead className="max-sm:hidden">
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Signed up</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y max-sm:block">
              {rows.map((r) => {
                const st = statusOf(r)
                const isUnsub = !!r.unsubscribed_at
                return (
                  <tr key={r.id} className={`max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-2 max-sm:p-4 ${isUnsub ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2.5 text-gray-800 max-sm:p-0 max-sm:w-full max-sm:font-medium">{r.name ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-sm:p-0 max-sm:w-full [overflow-wrap:anywhere]">{r.email}</td>
                    <td data-label="Signed up" className="px-4 py-2.5 text-gray-500 max-sm:p-0 max-sm:flex max-sm:items-center max-sm:gap-1.5 max-sm:before:content-[attr(data-label)] max-sm:before:text-xs max-sm:before:text-gray-500">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-2.5 max-sm:p-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-2.5 max-sm:p-0 max-sm:w-full">
                      <div className="flex items-center justify-end max-sm:justify-start gap-3">
                        <button
                          onClick={() => run(() => adminSetInterestUnsubscribed(r.id, leagueId, !isUnsub), r.id)}
                          disabled={pending && busyId === r.id}
                          className="press min-h-10 text-xs font-medium text-gray-600 hover:underline disabled:opacity-40"
                        >
                          {isUnsub ? 'Re-subscribe' : 'Unsubscribe'}
                        </button>
                        {confirmDeleteId === r.id ? (
                          <span className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500">Remove?</span>
                            <button onClick={() => run(() => adminRemoveInterest(r.id, leagueId), r.id)} disabled={pending && busyId === r.id} className="press min-h-10 px-1 text-red-600 font-medium hover:underline disabled:opacity-40">Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="press min-h-10 px-1 text-gray-600 hover:underline">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(r.id)} className="press min-h-10 text-xs text-red-600 hover:underline">Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
