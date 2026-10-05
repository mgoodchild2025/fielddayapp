'use client'

import { useEffect, useId, useState } from 'react'
import { Overlay } from '@/components/ui/overlay'

/**
 * In-app replacement for window.confirm(), for actions that really can't be
 * taken back (deleting games, events, brackets; regenerating codes; anything
 * that notifies people). Recoverable removals should NOT confirm — they act
 * at once and offer Undo (see use-undoable-remove.ts).
 *
 *   if (!(await confirmAction({ title: 'Delete this game?', confirmLabel: 'Delete', destructive: true }))) return
 *
 * One <ConfirmHost /> is mounted in the root layout. Cancel is focused by
 * default, so a stray Enter never confirms; Escape / backdrop = Cancel.
 */

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for deletes and other destructive actions. */
  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }
let show: ((p: Pending) => void) | null = null

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Host not mounted (shouldn't happen): fall back to the browser dialog
    // rather than silently proceeding.
    if (!show) {
      resolve(window.confirm([options.title, options.message].filter(Boolean).join('\n\n')))
      return
    }
    show({ ...options, resolve })
  })
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    // A second confirm while one is open (a double-tap on a delete) settles
    // the first as cancelled — it used to hang forever, leaving its caller's
    // busy state stuck.
    show = (p) => {
      setPending((prev) => { if (prev && prev !== p) prev.resolve(false); return p })
      setOpen(true)
    }
    return () => { show = null }
  }, [])

  const settle = (ok: boolean) => {
    if (!pending) return
    pending.resolve(ok)
    setOpen(false)
  }

  return (
    <Overlay
      open={open}
      onClose={() => settle(false)}
      variant="modal"
      labelledBy={titleId}
      zIndex={700}
      panelClassName="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6"
    >
      {pending && (
        <div>
          <h2 id={titleId} className="text-base font-semibold text-gray-900">{pending.title}</h2>
          {pending.message && (
            <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{pending.message}</p>
          )}
          <div className="mt-6 flex gap-3 justify-end">
            <button
              type="button"
              data-autofocus
              onClick={() => settle(false)}
              className="press min-h-10 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {pending.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              className={`press min-h-10 px-4 rounded-lg text-sm font-semibold ${
                pending.destructive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-primary hover:opacity-90'
              }`}
            >
              {pending.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </Overlay>
  )
}
