'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { markAllNotificationsRead, markNotificationRead } from '@/actions/notifications'
import { approveJoinRequest, rejectJoinRequest } from '@/actions/teams'
import { setAppBadge } from '@/lib/push-client'
import { toast } from 'sonner'

interface Notification {
  id: string
  type: string | null
  title: string
  body: string | null
  created_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}

interface Props {
  initialNotifications: Notification[]
  /** When true the dropdown opens upward — for use in a bottom nav bar */
  dropUp?: boolean
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function NotificationBell({ initialNotifications, dropUp = false }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [actioningId, setActioningId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const count = notifications.length

  // Installed app: the icon badge is the unread count, cleared when it hits 0.
  useEffect(() => { setAppBadge(count) }, [count])

  // Close on a tap/click outside (pointerdown — iOS Safari doesn't reliably
  // fire mousedown on plain areas) or Escape.
  useEffect(() => {
    if (!open) return
    function handlePointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Escape hands focus back to the bell (it was otherwise lost on the page).
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // A removed row takes the focused button with it: put focus on the row that
  // slides into its place (or the one above, or the bell) so a keyboard /
  // screen-reader user isn't dropped back at the top of the page.
  function refocusAfterRemoving(index: number) {
    requestAnimationFrame(() => {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('li')
      const target = rows?.[index] ?? rows?.[index - 1]
      const control = target?.querySelector<HTMLElement>('button, a[href]')
      ;(control ?? buttonRef.current)?.focus()
    })
  }

  function dismiss(id: string) {
    const index = notifications.findIndex((x) => x.id === id)
    setNotifications((prev) => prev.filter((x) => x.id !== id))
    markNotificationRead(id)
    refocusAfterRemoving(index)
  }

  // Approve / deny a join request: the notification goes only when the action
  // worked — it used to vanish even when the server refused.
  function actOnRequest(n: Notification, requestId: string, approve: boolean) {
    setActioningId(n.id)
    startTransition(async () => {
      try {
        const res = approve ? await approveJoinRequest(requestId) : await rejectJoinRequest(requestId)
        if (res?.error) { toast.error(res.error); return }
        await markNotificationRead(n.id)
        const index = notifications.findIndex((x) => x.id === n.id)
        setNotifications((prev) => prev.filter((x) => x.id !== n.id))
        refocusAfterRemoving(index)
        toast.success(approve ? 'Request approved' : 'Request declined')
      } catch {
        toast.error("Couldn't reach the server — try again")
      } finally {
        setActioningId(null)
      }
    })
  }

  function handleMarkAllRead() {
    setNotifications([])
    setOpen(false)
    startTransition(async () => {
      await markAllNotificationsRead()
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="notification-panel"
        className={`relative inline-flex items-center justify-center min-h-10 min-w-10 rounded-full transition-colors ${dropUp ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
        aria-label={count > 0 ? `${count} unread notification${count !== 1 ? 's' : ''}` : 'Notifications'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        // Phones: full width under the nav (a 320px panel anchored to the bell
        // started off the left edge of a 375px screen). sm+: the dropdown.
        <div id="notification-panel" role="region" aria-label="Notifications" className={`fd-pop z-50 overflow-hidden bg-white rounded-xl shadow-xl border border-gray-200 text-gray-900 ${
          dropUp
            ? 'absolute right-0 w-80 max-w-[calc(100vw-1rem)] origin-bottom-right bottom-full mb-2'
            : 'fixed inset-x-2 top-16 origin-top sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:w-80 sm:mt-2 sm:origin-top-right'
        }`}>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">Notifications</span>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="press min-h-10 px-2 -mr-2 text-sm font-medium text-brand-primary disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {count === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No new notifications
            </div>
          ) : (
            <ul ref={listRef} className="divide-y max-h-[min(24rem,70dvh)] overflow-y-auto overscroll-contain">
              {notifications.map((n) => {
                const acceptUrl = n.data?.accept_url as string | undefined
                // Generic link support: any notification can carry data.href (+ link_label)
                const genericHref = n.data?.href as string | undefined
                const genericLabel = (n.data?.link_label as string | undefined) ?? 'View →'
                const requestId = n.data?.request_id as string | undefined
                const isJoinRequest = n.type === 'join_request' && requestId
                const isActioning = actioningId === n.id

                return (
                  <li key={n.id} className="relative pl-4 pr-11 py-3">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    {n.body && <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>}
                    {!isJoinRequest && (
                      <button
                        type="button"
                        onClick={() => dismiss(n.id)}
                        aria-label={`Dismiss: ${n.title}`}
                        className="press absolute top-1.5 right-1.5 inline-flex items-center justify-center min-h-10 min-w-10 rounded-full text-gray-500 hover:bg-gray-100"
                      >
                        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}

                    {isJoinRequest ? (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          disabled={isActioning}
                          onClick={() => actOnRequest(n, requestId, true)}
                          className="press flex-1 min-h-10 text-sm font-semibold rounded-md bg-brand-primary text-on-brand disabled:opacity-50"
                        >
                          {isActioning ? '…' : 'Approve'}
                        </button>
                        <button
                          disabled={isActioning}
                          onClick={() => actOnRequest(n, requestId, false)}
                          className="press flex-1 min-h-10 text-sm font-semibold rounded-md border text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Deny
                        </button>
                        <p className="text-xs text-gray-500 shrink-0">{relativeTime(n.created_at)}</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-gray-500">{relativeTime(n.created_at)}</p>
                        {acceptUrl ? (
                          <Link
                            href={acceptUrl}
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center min-h-10 text-sm font-semibold text-brand-primary"
                          >
                            View Invite →
                          </Link>
                        ) : genericHref ? (
                          <Link
                            href={genericHref}
                            onClick={() => {
                              markNotificationRead(n.id)
                              setNotifications((prev) => prev.filter((x) => x.id !== n.id))
                              setOpen(false)
                            }}
                            className="inline-flex items-center min-h-10 text-sm font-semibold text-brand-primary"
                          >
                            {genericLabel}
                          </Link>
                        ) : null}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
