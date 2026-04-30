'use client'

import { useState } from 'react'
import QRCode from 'react-qr-code'

interface Props {
  checkinUrl: string
  playerName: string
  eventName: string
  size?: number
}

export function QRCodeDisplay({ checkinUrl, playerName, eventName, size = 200 }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="group flex items-center gap-3 w-full text-left mt-1 p-2 rounded-lg border border-dashed hover:border-[var(--brand-primary)] hover:bg-gray-50 transition-colors"
          style={{ borderColor: 'var(--brand-primary)20' }}
        >
          {/* Thumbnail QR */}
          <div className="relative shrink-0 w-14 h-14 rounded overflow-hidden opacity-80 group-hover:opacity-100 transition-opacity">
            <QRCode value={checkinUrl} size={56} style={{ width: '100%', height: '100%' }} />
            {/* Expand indicator overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 group-hover:bg-white/0 transition-colors">
              <svg className="w-4 h-4 text-gray-600 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            </div>
          </div>
          {/* Label */}
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>Check-in QR</p>
            <p className="text-xs text-gray-400">Tap to expand</p>
          </div>
        </button>
      ) : (
        <div className="mt-2 p-4 bg-white border rounded-lg text-center space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Check-in QR</p>
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Collapse ↑
            </button>
          </div>
          <div className="flex justify-center">
            <QRCode value={checkinUrl} size={size} />
          </div>
          {(playerName || eventName) && (
            <div>
              {playerName && <p className="text-sm font-semibold">{playerName}</p>}
              {eventName && <p className="text-xs text-gray-400">{eventName}</p>}
            </div>
          )}
          <p className="text-xs text-gray-400">
            Show this to an event rep, or scan to self check-in.
          </p>
        </div>
      )}
    </div>
  )
}

// Standalone version for full-page display (e.g. print)
export function QRCodeCard({ checkinUrl, playerName, eventName }: Omit<Props, 'size'>) {
  return (
    <div className="p-6 bg-white border-2 rounded-xl text-center space-y-4 max-w-xs mx-auto">
      <p className="text-lg font-bold uppercase" style={{ fontFamily: 'var(--brand-heading-font)' }}>
        {eventName}
      </p>
      <div className="flex justify-center">
        <QRCode value={checkinUrl} size={220} />
      </div>
      <div>
        <p className="text-base font-semibold">{playerName}</p>
        <p className="text-xs text-gray-400 mt-1">Present this QR code at check-in</p>
      </div>
    </div>
  )
}
