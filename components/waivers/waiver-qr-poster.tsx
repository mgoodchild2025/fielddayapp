'use client'

import QRCode from 'react-qr-code'

interface Props {
  waiverUrl: string
  leagueName: string
  orgName: string
  waiverTitle: string
}

export function WaiverQrPoster({ waiverUrl, leagueName, orgName, waiverTitle }: Props) {
  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.5in; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .print-hidden { display: none !important; }
        }
      `}</style>

      {/* Controls — hidden when printing */}
      <div className="print-hidden fixed top-4 left-1/2 -translate-x-1/2 flex gap-3 z-10">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium shadow-lg hover:bg-gray-700 transition-colors"
        >
          🖨 Print / Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 rounded-lg border bg-white text-sm text-gray-600 shadow-lg hover:bg-gray-50 transition-colors"
        >
          ← Close
        </button>
      </div>

      {/* Poster — letter-sized, centred */}
      <div
        className="min-h-screen flex items-center justify-center bg-white p-8"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        <div className="w-full max-w-lg text-center">

          {/* Org name */}
          <p
            className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-6"
          >
            {orgName}
          </p>

          {/* Main heading */}
          <h1
            className="text-4xl font-black uppercase tracking-tight text-gray-900 mb-2"
            style={{ lineHeight: 1.1 }}
          >
            Sign the Waiver
          </h1>

          {/* Event name */}
          <p className="text-lg font-semibold text-gray-600 mb-1">{leagueName}</p>
          <p className="text-sm text-gray-400 mb-10">{waiverTitle}</p>

          {/* QR code */}
          <div className="flex justify-center mb-8">
            <div className="border-4 border-gray-900 rounded-2xl p-5 inline-block">
              <QRCode
                value={waiverUrl}
                size={240}
                style={{ display: 'block' }}
              />
            </div>
          </div>

          {/* Instruction */}
          <p className="text-xl font-semibold text-gray-700 mb-4">
            Scan with your phone camera
          </p>
          <p className="text-sm text-gray-400 mb-6">
            No app download required &mdash; opens in your browser.
          </p>

          {/* URL fallback */}
          <div className="border border-gray-200 rounded-xl px-5 py-3 inline-block">
            <p className="text-[11px] text-gray-400 mb-1 uppercase tracking-wide font-medium">Or visit</p>
            <p className="text-sm font-mono text-gray-700 break-all">{waiverUrl}</p>
          </div>

          {/* Footer rule */}
          <div className="mt-12 border-t border-gray-100 pt-4">
            <p className="text-[10px] text-gray-300 uppercase tracking-widest">
              {orgName} &mdash; Powered by Fieldday
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
