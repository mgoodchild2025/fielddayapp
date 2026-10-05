'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { confirmAction } from '@/components/ui/confirm-dialog'

/**
 * Guards a form with unsaved edits against every way of leaving it:
 * closing/reloading the tab (`beforeunload`), tapping any in-app link (a
 * window capture-phase click handler that runs before React's — and so
 * before Next's <Link> — handler), Back (a parked history entry + popstate),
 * and
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
    // Back (the Android back gesture, iOS edge swipe, the browser button):
    // park a duplicate of the current history entry while the form is dirty,
    // so Back lands on it instead of leaving. Ask; "Discard" goes back for
    // real, "Keep editing" re-parks. The entry keeps Next's own history
    // state, so the router treats it as the same page.
    const GUARD = '__fdUnsavedGuard'
    const parked = !(window.history.state && window.history.state[GUARD])
    if (parked) window.history.pushState({ ...(window.history.state ?? {}), [GUARD]: true }, '', window.location.href)
    let leaving = false
    const onPopState = () => {
      if (leaving || dirtyForms.size === 0) return
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD]: true }, '', window.location.href)
      void confirmLeaveIfUnsaved().then((ok) => {
        if (!ok) return
        leaving = true
        window.history.go(-2)
      })
    }

    window.addEventListener('beforeunload', warn)
    window.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      dirtyForms.delete(key)
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
      // Saved or discarded in place: un-mark the parked entry (a history.back()
      // here could race the router.push that usually follows a save). The
      // duplicate stays — one extra Back on the same page, nothing lost.
      if (!leaving && window.history.state && window.history.state[GUARD]) {
        const rest = { ...window.history.state }
        delete rest[GUARD]
        window.history.replaceState(rest, '', window.location.href)
      }
    }
  }, [dirty, router])
}
