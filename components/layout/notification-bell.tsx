'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { markAllNotificationsRead, markNotificationRead } from '@/actions/notifications'
import { approveJoinRequest, rejectJoinRequest } from '@/actions/teams'

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

export function NotificationBell({ initialNotifications }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [actioningId, setActioningId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const count = notifications.length

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
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
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden text-gray-900">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">Notifications</span>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {count === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No new notifications
            </div>
          ) : (
            <ul className="divide-y max-h-96 overflow-y-auto">
              {notifications.map((n) => {
                const acceptUrl = n.data?.accept_url as string | undefined
                const requestId = n.data?.request_id as string | undefined
                const isJoinRequest = n.type === 'join_request' && requestId
                const isActioning = actioningId === n.id

                return (
                  <li key={n.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}

                    {isJoinRequest ? (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          disabled={isActioning}
                          onClick={() => {
                            setActioningId(n.id)
                            startTransition(async () => {
                              await Promise.all([approveJoinRequest(requestId), markNotificationRead(n.id)])
                              setNotifications((prev) => prev.filter((x) => x.id !== n.id))
                              setActioningId(null)
                            })
                          }}
                          className="flex-1 text-xs font-semibold py-1.5 rounded-md text-white disabled:opacity-50"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          {isActioning ? '…' : 'Approve'}
                        </button>
                        <button
                          disabled={isActioning}
                          onClick={() => {
                            setActioningId(n.id)
                            startTransition(async () => {
                              await Promise.all([rejectJoinRequest(requestId), markNotificationRead(n.id)])
                              setNotifications((prev) => prev.filter((x) => x.id !== n.id))
                              setActioningId(null)
                            })
                          }}
                          className="flex-1 text-xs font-semibold py-1.5 rounded-md border text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Deny
                        </button>
                        <p className="text-[10px] text-gray-400 shrink-0">{relativeTime(n.created_at)}</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[10px] text-gray-400">{relativeTime(n.created_at)}</p>
                        {acceptUrl && (
                          <Link
                            href={acceptUrl}
                            onClick={() => setOpen(false)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            View Invite →
                          </Link>
                        )}
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
