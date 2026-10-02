'use client'

import { useEffect, type RefObject } from 'react'
import { handoffDuration, releaseVelocity, rubberband, shouldDismiss, type Sample } from '@/lib/drag-physics'

/**
 * Drag-to-dismiss for the Overlay's `sheet` (down, on phones) and `drawer`
 * (right). Direct manipulation, per Apple's fluid-interface rules:
 *
 * - Intent is decided on the first real movement (10px hysteresis): along the
 *   dismiss axis, and — for a sheet — only while the content under the finger
 *   is scrolled to the top, so ordinary scrolling still scrolls. Anything
 *   else is left to the browser.
 * - While dragging the panel tracks the finger 1:1 (no transition) and the
 *   backdrop fades with it; dragging the wrong way rubber-bands.
 * - On release, momentum is projected forward to choose open vs closed, and
 *   the panel leaves at roughly the finger's speed (or springs back).
 *
 * Touch scrolling is held off with a non-passive touchmove listener that
 * cancels only once a dismiss drag has engaged.
 */

const HYSTERESIS = 10
const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [data-no-drag], input[type="range"]'

export function useDragDismiss({
  panelRef,
  backdropRef,
  axis,
  enabled,
  onDismiss,
}: {
  panelRef: RefObject<HTMLDivElement | null>
  backdropRef: RefObject<HTMLDivElement | null>
  axis: 'down' | 'right'
  enabled: boolean
  onDismiss: () => void
}) {
  useEffect(() => {
    const panel = panelRef.current
    if (!enabled || !panel) return
    // Sheets are centred modals from sm up — drag only where they're sheets.
    const sheetQuery = axis === 'down' ? window.matchMedia('(max-width: 639px)') : null

    type Drag = { id: number; x0: number; y0: number; engaged: boolean; refused: boolean; samples: Sample[]; size: number; scroller: HTMLElement | null }
    let drag: Drag | null = null
    // A drag that ends over a button must not also click it.
    let swallowClick = false

    const along = (e: PointerEvent | Touch, d: Drag) => (axis === 'down' ? e.clientY - d.y0 : e.clientX - d.x0)
    const across = (e: PointerEvent | Touch, d: Drag) => (axis === 'down' ? e.clientX - d.x0 : e.clientY - d.y0)

    function scrollableAncestor(el: Element | null): HTMLElement | null {
      for (let n = el as HTMLElement | null; n && n !== panel!.parentElement; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n
      }
      return null
    }

    function setOffset(px: number, size: number) {
      const t = axis === 'down' ? `translateY(${px}px)` : `translateX(${px}px)`
      panel!.style.transition = 'none'
      panel!.style.transform = t
      const backdrop = backdropRef.current
      if (backdrop) {
        backdrop.style.transition = 'none'
        backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, px) / size))
      }
    }

    function release(px: number, velocity: number, size: number) {
      const backdrop = backdropRef.current
      if (shouldDismiss(px, velocity, size)) {
        // Leave at the finger's speed; the Overlay's closed state holds the
        // same end transform, so nothing jumps when React catches up.
        const ms = handoffDuration(size - px, velocity)
        panel!.style.transition = `transform ${ms}ms cubic-bezier(0.32, 0.72, 0, 1)`
        panel!.style.transform = axis === 'down' ? 'translateY(100%)' : 'translateX(100%)'
        if (backdrop) {
          backdrop.style.transition = `opacity ${ms}ms ease-out`
          backdrop.style.opacity = '0'
        }
        onDismiss()
      } else {
        // Spring back to rest from wherever the finger let go.
        panel!.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)'
        panel!.style.transform = ''
        if (backdrop) {
          backdrop.style.transition = 'opacity 300ms ease-out'
          backdrop.style.opacity = ''
        }
        const clear = () => {
          panel!.style.transition = ''
          if (backdrop) backdrop.style.transition = ''
          panel!.removeEventListener('transitionend', clear)
        }
        panel!.addEventListener('transitionend', clear)
      }
    }

    function onPointerDown(e: PointerEvent) {
      if (drag || e.button > 0) return
      if (sheetQuery && !sheetQuery.matches) return
      if ((e.target as Element).closest(NO_DRAG)) return
      const rect = panel!.getBoundingClientRect()
      drag = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY, engaged: false, refused: false,
        samples: [], size: axis === 'down' ? rect.height : rect.width,
        scroller: axis === 'down' ? scrollableAncestor(e.target as Element) : null,
      }
    }

    // Decide intent on the first real movement. Returns true once engaged.
    function decide(dAlong: number, dAcross: number): boolean {
      const d = drag!
      if (d.engaged) return true
      if (d.refused) return false
      if (Math.abs(dAlong) < HYSTERESIS && Math.abs(dAcross) < HYSTERESIS) return false
      const towardClose = dAlong > 0 && Math.abs(dAlong) > Math.abs(dAcross) * 1.2
      const atTop = !d.scroller || d.scroller.scrollTop <= 0
      if (towardClose && atTop) {
        d.engaged = true
        return true
      }
      d.refused = true
      return false
    }

    function onPointerMove(e: PointerEvent) {
      const d = drag
      if (!d || e.pointerId !== d.id) return
      const a = along(e, d)
      if (!decide(a, across(e, d))) return
      if (!panel!.hasPointerCapture(e.pointerId)) {
        try { panel!.setPointerCapture(e.pointerId) } catch {}
      }
      d.samples.push({ pos: a, t: e.timeStamp })
      if (d.samples.length > 12) d.samples.shift()
      setOffset(a >= 0 ? a : rubberband(a, d.size), d.size)
    }

    function onPointerUp(e: PointerEvent) {
      const d = drag
      if (!d || e.pointerId !== d.id) return
      drag = null
      if (!d.engaged) return
      swallowClick = true
      setTimeout(() => { swallowClick = false }, 0)
      const a = along(e, d)
      d.samples.push({ pos: a, t: e.timeStamp })
      release(Math.max(0, a), releaseVelocity(d.samples), d.size)
    }

    function onPointerCancel(e: PointerEvent) {
      const d = drag
      if (!d || e.pointerId !== d.id) return
      drag = null
      if (d.engaged) release(0, 0, d.size)
    }

    // Once a dismiss drag has engaged, stop the browser scrolling underneath
    // (pointer events alone can't — touch-action is decided at touchstart).
    function onTouchMove(e: TouchEvent) {
      const d = drag
      if (!d) return
      const t = e.touches[0]
      if (t && decide(along(t, d), across(t, d))) e.preventDefault()
    }

    function onClickCapture(e: MouseEvent) {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    panel.addEventListener('click', onClickCapture, true)
    panel.addEventListener('pointerdown', onPointerDown)
    panel.addEventListener('pointermove', onPointerMove)
    panel.addEventListener('pointerup', onPointerUp)
    panel.addEventListener('pointercancel', onPointerCancel)
    panel.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      panel.removeEventListener('click', onClickCapture, true)
      panel.removeEventListener('pointerdown', onPointerDown)
      panel.removeEventListener('pointermove', onPointerMove)
      panel.removeEventListener('pointerup', onPointerUp)
      panel.removeEventListener('pointercancel', onPointerCancel)
      panel.removeEventListener('touchmove', onTouchMove)
    }
  }, [panelRef, backdropRef, axis, enabled, onDismiss])
}
