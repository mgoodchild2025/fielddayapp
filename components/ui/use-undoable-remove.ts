'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

/**
 * Remove now, Undo for a few seconds — instead of "Are you sure?".
 *
 * The item disappears at once and a toast offers Undo. The real delete
 * (`commit`) runs only when the toast closes without Undo (timeout, swipe or
 * close). If the delete fails, the item comes back with the error.
 *
 * Two shapes:
 * - `undoableRemove({ label, restore, commit })` — you've already taken the
 *   item out of local state; `restore` puts it back.
 * - `useUndoableRemove()` — for lists rendered from server data: hide rows by
 *   id until the delete lands (then `onCommitted`, e.g. router.refresh).
 *
 * Use for recoverable, side-effect-free removals only. Anything that emails
 * people, cascades, or can't be rebuilt belongs behind confirmAction().
 * Caveat: closing the tab inside the Undo window may keep the item (the
 * delete is attempted on pagehide, but the browser may not finish it).
 */

// 10s, not 5: enough time to notice, reach the toast (keyboard, screen
// reader, switch access) and press Undo.
const UNDO_MS = 10_000

type CommitResult = { error?: string | null } | void | unknown
type Commit = () => Promise<CommitResult>

// Deletes waiting out their Undo window, flushed if the page is closed.
const pending = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { for (const run of [...pending]) run() })
}

export function undoableRemove(opts: { label: string; restore: () => void; commit: Commit; onCommitted?: () => void }) {
  let settled = false
  const shown: { id?: string | number } = {}
  const run = async () => {
    if (settled) return
    settled = true
    pending.delete(run)
    // Flushed early (pagehide): retire the toast so a stale Undo can't show.
    if (shown.id !== undefined) toast.dismiss(shown.id)
    try {
      const res = await opts.commit()
      const error = res && typeof res === 'object' && 'error' in res ? (res as { error?: string | null }).error : null
      if (error) {
        opts.restore()
        toast.error(error)
        return
      }
      opts.onCommitted?.()
    } catch {
      opts.restore()
      toast.error('Something went wrong — nothing was removed.')
    }
  }
  pending.add(run)

  shown.id = toast(opts.label, {
    duration: UNDO_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        if (settled) return // the delete already ran
        settled = true
        pending.delete(run)
        opts.restore()
      },
    },
    onAutoClose: run,
    onDismiss: run,
  })
}

export function useUndoableRemove() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())

  const remove = useCallback((id: string, opts: { label: string; commit: Commit; onCommitted?: () => void }) => {
    setHidden((h) => new Set(h).add(id))
    undoableRemove({
      ...opts,
      restore: () => setHidden((h) => { const n = new Set(h); n.delete(id); return n }),
    })
  }, [])

  const isHidden = useCallback((id: string) => hidden.has(id), [hidden])
  return { isHidden, remove }
}

/** Put `item` back at `index` (clamped) — for undoableRemove's restore. */
export function insertAt<T>(list: T[], index: number, item: T): T[] {
  const i = Math.max(0, Math.min(index, list.length))
  return [...list.slice(0, i), item, ...list.slice(i)]
}
