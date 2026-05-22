'use client'

import QRCode from 'react-qr-code'

interface Props {
  checkinUrl: string
  eventName: string
  sessionLabel?: string | null
  orgName: string
}

export function PrintQrCode({ checkinUrl, eventName, sessionLabel, orgName }: Props) {
  return (
    <>
      {/* Print controls — hidden when printing */}
      <div className="flex gap-3 mb-8 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          🖨 Print / Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-5 py-2.5 rounded-lg border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Close
        </button>
      </div>

      {/* QR card — centered, print-optimised */}
      <div className="flex flex-col items-center justify-center min-h-[70vh] print:min-h-screen">
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-10 text-center max-w-sm w-full space-y-6 print:border-none print:rounded-none print:p-0 print:shadow-none">

          {/* Org + event name */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
              {orgName}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              {eventName}
            </h1>
            {sessionLabel && (
              <p className="text-sm text-gray-500 mt-1">{sessionLabel}</p>
            )}
          </div>

          {/* QR code */}
          <div className="flex justify-center py-2">
            <QRCode value={checkinUrl} size={220} />
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-gray-800">Scan to check in</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              Open your camera and scan the code above. You&apos;ll be checked in automatically when you arrive.
            </p>
          </div>

          {/* URL hint */}
          <p className="text-[11px] text-gray-300 break-all">{checkinUrl}</p>
        </div>
      </div>
    </>
  )
}
