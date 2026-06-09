'use client'

import { useState } from 'react'
import { CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react'

export interface InstallmentRow {
  id: string
  installment_number: number
  amount_cents: number
  due_date: string
  status: 'pending' | 'paid' | 'failed'
  stripe_checkout_session_id?: string | null
}

interface Props {
  installments: InstallmentRow[]
  currency?: string
  /** When provided, renders a "Pay →" button for pending/failed instalments (player mode). */
  onPayClick?: (installmentId: string) => Promise<void>
  /** When provided, renders a "Mark paid" button for admins instead of Stripe pay. */
  onMarkPaid?: (installmentId: string) => Promise<void>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtMoney(cents: number, currency = 'CAD') {
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
}

function isOverdue(row: InstallmentRow) {
  return row.status === 'pending' && new Date(row.due_date) < new Date()
}

export function InstallmentSchedule({ installments, currency = 'CAD', onPayClick, onMarkPaid }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)

  const totalCents = installments.reduce((s, i) => s + i.amount_cents, 0)
  const paidCents  = installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount_cents, 0)
  const remaining  = totalCents - paidCents

  async function handlePay(id: string) {
    if (!onPayClick || pendingId) return
    setPendingId(id)
    try {
      await onPayClick(id)
    } finally {
      setPendingId(null)
    }
  }

  async function handleMark(id: string) {
    if (!onMarkPaid || pendingId) return
    setPendingId(id)
    try {
      await onMarkPaid(id)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Payment Plan</span>
        {remaining > 0 && (
          <span className="text-xs text-gray-500">
            {fmtMoney(remaining, currency)} remaining
          </span>
        )}
        {remaining === 0 && (
          <span className="text-xs font-medium text-green-600">Paid in full</span>
        )}
      </div>

      <div className="divide-y">
        {installments.map((inst) => {
          const overdue = isOverdue(inst)
          const actionable = inst.status === 'pending' || inst.status === 'failed'

          return (
            <div
              key={inst.id}
              className={`flex items-center gap-3 px-4 py-3 ${overdue ? 'bg-red-50' : ''}`}
            >
              {/* Status icon */}
              {inst.status === 'paid' && (
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              )}
              {inst.status === 'pending' && !overdue && (
                <Circle className="w-4 h-4 text-gray-300 shrink-0" />
              )}
              {(inst.status === 'failed' || overdue) && (
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              )}

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800">
                  Instalment {inst.installment_number}
                </span>
                <span className={`ml-2 text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  {inst.status === 'paid'
                    ? `Paid ${fmtDate(inst.due_date)}`
                    : overdue
                      ? `Overdue — was due ${fmtDate(inst.due_date)}`
                      : `Due ${fmtDate(inst.due_date)}`}
                </span>
              </div>

              {/* Amount */}
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${inst.status === 'paid' ? 'text-gray-400' : 'text-gray-900'}`}>
                {fmtMoney(inst.amount_cents, currency)}
              </span>

              {/* Pay / Mark paid button */}
              {actionable && onPayClick && (
                <button
                  type="button"
                  onClick={() => handlePay(inst.id)}
                  disabled={!!pendingId}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md text-white disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {pendingId === inst.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : `Pay ${fmtMoney(inst.amount_cents, currency)} →`}
                </button>
              )}
              {actionable && onMarkPaid && (
                <button
                  type="button"
                  onClick={() => handleMark(inst.id)}
                  disabled={!!pendingId}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {pendingId === inst.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Mark paid'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
