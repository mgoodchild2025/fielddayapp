'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { InstallmentSchedule } from './installment-schedule'
import type { InstallmentRow } from './installment-schedule'
import { adminMarkInstallmentPaid } from '@/actions/payment-plans'

interface Props {
  registrationId: string
  installments: InstallmentRow[]
}

/**
 * Admin-facing badge + expandable InstallmentSchedule with "Mark paid" per instalment.
 * Rendered inside the registrations table row.
 */
export function AdminInstallmentRow({ registrationId, installments }: Props) {
  const [open, setOpen] = useState(false)
  const [localInstallments, setLocalInstallments] = useState(installments)

  const paidCount = localInstallments.filter(i => i.status === 'paid').length
  const total = localInstallments.length

  async function handleMarkPaid(installmentId: string) {
    const result = await adminMarkInstallmentPaid(installmentId)
    if (result.error) {
      alert(result.error)
      return
    }
    // Optimistically update local state
    setLocalInstallments(prev =>
      prev.map(i => i.id === installmentId ? { ...i, status: 'paid' as const } : i)
    )
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        aria-expanded={open}
        aria-label={`Payment plan: ${paidCount} of ${total} paid`}
      >
        💳 Plan ({paidCount}/{total})
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 max-w-sm" data-registration-id={registrationId}>
          <InstallmentSchedule
            installments={localInstallments}
            onMarkPaid={handleMarkPaid}
          />
        </div>
      )}
    </div>
  )
}
