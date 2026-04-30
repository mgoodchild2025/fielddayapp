'use client'

import { useState } from 'react'
import QRCode from 'react-qr-code'

interface Props {
  checkinUrl: string
  playerName: string
  eventName: string
  size?: number
}

export function QRCodeDisplay({ checkinUrl, playerName, eventName, size = 180 }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-medium hover:underline"
        style={{ color: 'var(--brand-primary)' }}
      >
        {expanded ? 'Hide QR code' : 'Show check-in QR'}
      </button>

      {expanded && (
        <div className="mt-3 p-4 bg-white border rounded-lg text-center space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Check-in QR</p>
          <div className="flex justify-center">
            <QRCode value={checkinUrl} size={size} />
          </div>
          <div>
            <p className="text-sm font-semibold">{playerName}</p>
            <p className="text-xs text-gray-400">{eventName}</p>
          </div>
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
