'use client'

import QRCode from 'react-qr-code'
import { Printer } from 'lucide-react'

interface Props {
  url: string
  eventName: string
  priceLabel: string | null   // e.g. "$15.00" or null for free
}

/** A scan-to-register poster for drop-in events — print it for the venue or
 *  display it fullscreen on the organizer's phone. The QR opens the standard
 *  registration → waiver → payment flow, so participants self-serve. */
export function RegistrationQrPoster({ url, eventName, priceLabel }: Props) {
  return (
    <div className="max-w-md mx-auto">
      <div className="flex justify-end mb-4 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="bg-white rounded-2xl border p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Scan to join</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1 leading-tight">{eventName}</h1>
        {priceLabel && (
          <p className="text-lg font-semibold mt-1" style={{ color: 'var(--brand-primary)' }}>{priceLabel} drop-in</p>
        )}

        <div className="my-6 flex justify-center">
          <div className="p-3 bg-white rounded-lg border">
            <QRCode value={url} size={256} style={{ height: 'auto', maxWidth: '100%', width: 256 }} />
          </div>
        </div>

        <p className="text-sm text-gray-700 font-medium">Scan with your phone camera</p>
        <p className="text-xs text-gray-500 mt-1">Register, sign the waiver{priceLabel ? ', and pay' : ''} — all on your phone.</p>
        <p className="mt-3 text-[10px] text-gray-300 break-all">{url}</p>
      </div>
    </div>
  )
}
