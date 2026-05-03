'use client'

import { useState } from 'react'
import { Copy, Check, X, Calendar } from 'lucide-react'

interface Props {
  teamId: string
  calendarToken: string
  host: string
}

export function CalendarSubscribeButton({ teamId, calendarToken, host }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const feedPath = `/api/teams/${teamId}/calendar.ics?token=${calendarToken}`
  const feedUrl = `${protocol}://${host}${feedPath}`
  // webcal:// triggers native calendar app on iOS/macOS
  const webcalUrl = `webcal://${host}${feedPath}`
  // Google Calendar add-by-URL
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`

  async function handleCopy() {
    await navigator.clipboard.writeText(webcalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full py-2 rounded-md text-sm font-medium border hover:bg-gray-50 transition-colors text-gray-600 flex items-center justify-center gap-2"
      >
        <Calendar className="w-4 h-4" />
        Subscribe to schedule
      </button>
    )
  }

  return (
    <div className="mt-4 border rounded-md p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Subscribe to Schedule</p>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Your calendar will stay in sync as games update.
      </p>

      {/* webcal link with inline copy */}
      <div className="flex items-center gap-2 bg-white border rounded px-3 py-2 mb-3">
        <a
          href={webcalUrl}
          className="text-xs font-mono text-gray-600 truncate flex-1 hover:text-gray-900"
          title={webcalUrl}
        >
          {webcalUrl}
        </a>
        <button
          onClick={handleCopy}
          aria-label="Copy calendar link"
          className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-600 font-medium">Copied!</span>
            </>
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Google Calendar button */}
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2 rounded-md text-sm font-medium border bg-white hover:bg-gray-50 transition-colors text-gray-700"
      >
        {/* Google Calendar wordmark colour via inline SVG — no external request */}
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path fill="#4285F4" d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10 10-4.48 10-10z" opacity=".1"/>
          <path fill="#4285F4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
        </svg>
        Add to Google Calendar
      </a>

      <p className="text-xs text-gray-400 mt-2 text-center">
        Tap the link above to open in Apple Calendar, or use the Google button.
      </p>
    </div>
  )
}
