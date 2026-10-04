'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { confirmAction } from '@/components/ui/confirm-dialog'

/**
 * Guards a form with unsaved edits against every way of leaving it:
 * closing/reloading the tab (`beforeunload`), tapping any in-app link (a
 * window capture-phase click handler that runs before React's — and so
 * before Next's <Link> — handler), and
 * programmatic navigation that calls `confirmLeaveIfUnsaved()` first (the
 * event admin tab select, Cancel buttons).
 *
 * Pass `dirty` from the form's real user input (see Edit Event: onInput /
 * onChange bubbling to the <form>), never from programmatic syncs.
 */

const dirtyForms = new Set<symbol>()

/** Ask before discarding unsaved edits anywhere on the page. Resolves true to go ahead. */
export async function confirmLeaveIfUnsaved(): Promise<boolean> {
  if (dirtyForms.size === 0) return true
  const ok = await confirmAction({
    title: 'Discard your changes?',
    message: 'You have edits that haven’t been saved.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    destructive: true,
  })
  if (ok) dirtyForms.clear()
  return ok
}

export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter()
  const id = useRef(Symbol('form'))

  useEffect(() => {
    const key = id.current
    if (!dirty) { dirtyForms.delete(key); return }
    dirtyForms.add(key)

    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Same page (hash links, "#top"): nothing is lost.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      void confirmLeaveIfUnsaved().then((ok) => { if (ok) router.push(url.pathname + url.search + url.hash) })
    }
    window.addEventListener('beforeunload', warn)
    window.addEventListener('click', onClick, true)
    return () => {
      dirtyForms.delete(key)
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('click', onClick, true)
    }
  }, [dirty, router])
}
