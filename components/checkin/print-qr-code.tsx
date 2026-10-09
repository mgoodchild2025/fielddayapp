'use client'

import QRCode from 'react-qr-code'
import { usePrintOrShare } from '@/components/print/use-print-or-share'

interface Props {
  checkinUrl: string
  eventName: string
  sessionLabel?: string | null
  orgName: string
}

export function PrintQrCode({ checkinUrl, eventName, sessionLabel, orgName }: Props) {
  const printer = usePrintOrShare()
  return (
    <>
      {/* Print controls — hidden when printing */}
      <div className="flex gap-3 mb-8 print:hidden">
        <button
          onClick={printer.print}
          disabled={printer.busy}
          className="px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          {printer.label}
        </button>
        <button
          onClick={printer.back}
          className="px-5 py-2.5 rounded-lg border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {printer.backLabel}
        </button>
      </div>

      {/* Full-page centred layout */}
      <div className="flex flex-col items-center justify-center min-h-[85vh] print:min-h-dvh print:justify-center">
        <div className="text-center w-full max-w-lg space-y-8">

          {/* Event name */}
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
              {orgName}
            </p>
            <h1 className="text-4xl font-bold text-gray-900 leading-tight">
              {eventName}
            </h1>
            {sessionLabel && (
              <p className="text-lg text-gray-500 mt-2">{sessionLabel}</p>
            )}
          </div>

          {/* "Scan to check in" — big and obvious */}
          <div className="space-y-2">
            <p className="text-5xl font-black text-gray-900 tracking-tight leading-none whitespace-nowrap">
              📱 Scan to check in
            </p>
            <p className="text-lg text-gray-500">
              Open your phone camera and point it at the code below
            </p>
          </div>

          {/* QR code — large */}
          <div className="flex justify-center">
            <div className="p-6 bg-white border-4 border-gray-900 rounded-2xl inline-block print:border-gray-900">
              <QRCode value={checkinUrl} size={320} />
            </div>
          </div>

          {/* URL hint */}
          <p className="text-xs text-gray-300 break-all">{checkinUrl}</p>
        </div>
      </div>
    </>
  )
}
