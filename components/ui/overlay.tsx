'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * The one overlay: modals, mobile bottom sheets, and side drawers.
 *
 * - `modal`  — centred; fades + scales from 0.96.
 * - `sheet`  — slides up from the bottom on phones; a centred modal from sm.
 * - `drawer` — slides in from the right edge, full height.
 *
 * Motion lives in globals.css (`.fd-overlay*`): CSS transitions, so an
 * open/close reversed mid-way retargets instead of restarting; enter via
 * @starting-style (browsers without it simply skip the entrance); exits play
 * before unmount and run faster than entrances. Reduced motion keeps the fade
 * and drops the movement.
 *
 * Behaviour every overlay needs and used to hand-roll: portal to <body>,
 * backdrop click + Escape to close, page scroll lock, focus moved in on open
 * (first [data-autofocus] element, else the panel), Tab kept inside, and focus
 * returned to the trigger on close.
 */

type Variant = 'modal' | 'sheet' | 'drawer'

const EXIT_MS = 260 // longest exit transition + a frame

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Open overlays, oldest first: the scroll lock is shared, and Escape / Tab
// belong to the topmost one only.
const stack: symbol[] = []

export function Overlay({
  open,
  onClose,
  variant = 'modal',
  label,
  labelledBy,
  className = '',
  panelClassName = '',
  panelStyle,
  zIndex,
  closeOnBackdrop = true,
  children,
}: {
  open: boolean
  onClose: () => void
  variant?: Variant
  /** Accessible name when there's no visible heading to point at. */
  label?: string
  /** id of the visible heading that names the dialog. */
  labelledBy?: string
  /** Extra classes on the full-screen wrapper (e.g. `md:hidden`). */
  className?: string
  /** Size, surface and layout of the panel itself. */
  panelClassName?: string
  panelStyle?: CSSProperties
  zIndex?: number
  closeOnBackdrop?: boolean
  children: ReactNode
}) {
  // Stay mounted through the exit transition. Opening mounts during render
  // (the "adjust state on prop change" pattern); closing unmounts once the
  // exit has played.
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (open || !mounted) return
    const t = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(t)
  }, [open, mounted])

  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Scroll lock, Escape, focus in/out, Tab trap — only while open.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const id = Symbol('overlay')
    if (stack.length === 0) document.body.style.overflow = 'hidden'
    stack.push(id)

    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]')
    ;(first ?? panel)?.focus({ preventScroll: true })

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) { e.preventDefault(); return }
      const firstItem = items[0], lastItem = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === panel)) {
        e.preventDefault(); lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault(); firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(id), 1)
      if (stack.length === 0) document.body.style.overflow = ''
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [open])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`fd-overlay fd-overlay--${variant} ${className}`}
      data-state={open ? 'open' : 'closed'}
      style={zIndex !== undefined ? { zIndex } : undefined}
    >
      <div
        className="fd-overlay__backdrop"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`fd-overlay__panel ${panelClassName}`}
        style={panelStyle}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/**
 * The last non-null value. Lets an overlay keep rendering its content through
 * the exit transition after the data that opened it (e.g. `editingGame`) has
 * already been cleared:
 *
 *   const shown = useRetained(editingGame)
 *   <Overlay open={!!editingGame} …>{shown && <Editor game={shown} />}</Overlay>
 */
export function useRetained<T>(value: T | null | undefined): T | null {
  const [kept, setKept] = useState<T | null>(value ?? null)
  if (value != null && value !== kept) setKept(value)
  return value ?? kept
}
