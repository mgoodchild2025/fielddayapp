'use client'

import { useFormStatus } from 'react-dom'
import { confirmAction, type ConfirmOptions } from '@/components/ui/confirm-dialog'

/**
 * Submit button for server-action forms (`<form action={…}>`, usable from
 * server components). While the action runs it disables itself and shows
 * `pendingLabel` — without it a tap gave no sign anything was happening until
 * the page changed, so admins tapped again.
 *
 * Optional confirmation (serializable, so server pages can pass it):
 *  - `confirm` — always ask first;
 *  - `confirmIf` — ask only when a form field has a given value
 *    (e.g. the status select is set to "archived").
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  style,
  confirm,
  confirmIf,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  pendingLabel?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  confirm?: ConfirmOptions
  confirmIf?: { field: string; value: string } & ConfirmOptions
  'aria-label'?: string
}) {
  const { pending } = useFormStatus()

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form
    if (!form) return
    const ask = confirm ?? (confirmIf && new FormData(form).get(confirmIf.field) === confirmIf.value ? confirmIf : null)
    if (!ask) return
    e.preventDefault()
    if (await confirmAction(ask)) form.requestSubmit()
  }

  return (
    <button
      type="submit"
      onClick={confirm || confirmIf ? onClick : undefined}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      className={`${className ?? ''} disabled:opacity-60 disabled:cursor-wait`}
      style={style}
    >
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </button>
  )
}
