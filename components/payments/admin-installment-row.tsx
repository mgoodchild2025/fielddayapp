'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { InstallmentSchedule } from './installment-schedule'
import type { InstallmentRow } from './installment-schedule'
import { adminMarkInstallmentPaid } from '@/actions/payment-plans'
import { toast } from 'sonner'
import { Collapse } from '@/components/ui/collapse'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { safeAction } from '@/lib/action-errors'
import { formatDollars } from '@/lib/money'

interface Props {
  registrationId: string
  installments: InstallmentRow[]
  /** Marking an instalment paid records money — org admins only. */
  canMarkPaid?: boolean
  timeZone?: string
}

/**
 * Admin-facing badge + expandable InstallmentSchedule, with "Mark paid" per
 * instalment for org admins (read-only for league admins).
 * Rendered inside the registrations table row.
 */
export function AdminInstallmentRow({ registrationId, installments, canMarkPaid = false, timeZone }: Props) {
  const [open, setOpen] = useState(false)
  const [localInstallments, setLocalInstallments] = useState(installments)

  const paidCount = localInstallments.filter(i => i.status === 'paid').length
  const total = localInstallments.length

  async function handleMarkPaid(installmentId: string) {
    // Records money and there's no "unmark" — one stray tap on a phone
    // shouldn't do that.
    const inst = localInstallments.find(i => i.id === installmentId)
    const n = localInstallments.findIndex(i => i.id === installmentId) + 1
    if (!(await confirmAction({
      title: `Mark instalment ${n} of ${total} paid?`,
      message: inst ? `Records ${formatDollars(inst.amount_cents)} as received. This can't be undone from here.` : undefined,
      confirmLabel: 'Mark paid',
    }))) return
    const result = await safeAction(adminMarkInstallmentPaid(installmentId))
    if (result.error) {
      toast.error(result.error)
      return
    }
    // Optimistically update local state
    setLocalInstallments(prev =>
      prev.map(i => i.id === installmentId ? { ...i, status: 'paid' as const } : i)
    )
    toast.success(`Instalment ${n} marked paid`)
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="press inline-flex items-center gap-1 min-h-10 px-3 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
        aria-expanded={open}
        aria-label={`Payment plan: ${paidCount} of ${total} paid`}
      >
        💳 Plan ({paidCount}/{total})
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      <Collapse open={open}>
        <div className="mt-2 max-w-sm" data-registration-id={registrationId}>
          <InstallmentSchedule
            installments={localInstallments}
            onMarkPaid={canMarkPaid ? handleMarkPaid : undefined}
            timeZone={timeZone}
          />
        </div>
      </Collapse>
    </div>
  )
}
