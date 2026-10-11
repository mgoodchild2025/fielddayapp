'use client'

import { useState } from 'react'
import QRCode from 'react-qr-code'
import { Printer } from 'lucide-react'
import { usePrintOrShare } from '@/components/print/use-print-or-share'

/**
 * Printable Door Alert signs. Rendered at real page size (CSS inches) with an
 * @page rule, so "Print / Save as PDF" gives the right paper size; on an
 * iPhone home-screen app usePrintOrShare turns [data-print-root] into a PDF.
 * Black on white for outdoor contrast; the brand stripes print as colour.
 */

type Brand = { orgName: string; logoUrl: string | null; primary: string; secondary: string }

const STRIPES = (b: Brand) =>
  `repeating-linear-gradient(135deg, ${b.primary} 0 0.28in, ${b.secondary} 0.28in 0.56in)`

function SizePicker<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label="Paper size" className="inline-flex rounded-md border bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`press min-h-9 rounded px-3 text-sm font-semibold ${value === o.value ? 'bg-gray-900 text-white' : 'text-gray-700'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toolbar({ children, onPrint, busy, label }: { children: React.ReactNode; onPrint: () => void; busy: boolean; label: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
      {children}
      <button type="button" onClick={onPrint} disabled={busy} className="press inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary text-on-brand px-4 text-sm font-semibold disabled:opacity-60">
        <Printer className="h-4 w-4" aria-hidden="true" /> {label}
      </button>
    </div>
  )
}

const PRINT_EXACT = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties

// The sheet is exactly one page: when printing, pin it to the page corner so
// the admin page's own padding can't push it onto a second sheet.
const PIN_FOR_PRINT = '@media print { [data-print-root] { position: fixed !important; inset: 0 !important; margin: 0 !important; box-shadow: none !important } }'

// ── Visitor sign ──────────────────────────────────────────────────────────────

export function DoorSign({ brand, visitorUrl }: { brand: Brand; visitorUrl: string }) {
  const [size, setSize] = useState<'letter' | 'tabloid'>('letter')
  const printer = usePrintOrShare('Print / Save as PDF')
  const big = size === 'tabloid'
  const w = big ? 11 : 8.5
  const h = big ? 17 : 11
  const k = big ? 1.5 : 1 // type and QR scale with the sheet

  return (
    <div>
      <style>{`@page { size: ${w}in ${h}in; margin: 0 } ${PIN_FOR_PRINT}`}</style>
      <Toolbar onPrint={printer.print} busy={printer.busy} label={printer.label}>
        <SizePicker value={size} onChange={setSize} options={[{ value: 'letter', label: 'Letter' }, { value: 'tabloid', label: '11 × 17' }]} />
      </Toolbar>
      <p className="mb-3 text-sm text-gray-600 print:hidden">Laminate it or mount it on corrugated plastic. The QR is sized to scan from about a metre away.</p>
      <div className="overflow-x-auto print:overflow-visible">
        <div
          data-print-root
          className="mx-auto flex flex-col bg-white text-black shadow print:shadow-none"
          style={{ width: `${w}in`, height: `${h}in`, ...PRINT_EXACT }}
        >
          <div style={{ height: `${0.55 * k}in`, backgroundImage: STRIPES(brand), ...PRINT_EXACT }} />
          <div className="flex flex-1 flex-col items-center justify-between text-center" style={{ padding: `${0.45 * k}in ${0.6 * k}in` }}>
            <div className="flex items-center gap-3" style={{ fontSize: `${18 * k}pt` }}>
              {brand.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt="" style={{ height: `${0.7 * k}in`, width: 'auto' }} />
              )}
              <span className="font-bold">{brand.orgName}</span>
            </div>
            <div>
              <p className="font-black uppercase leading-[0.9] tracking-tight [font-stretch:condensed]" style={{ fontSize: `${78 * k}pt` }}>At the door?</p>
              <p className="mt-2 font-black uppercase tracking-wide" style={{ fontSize: `${30 * k}pt` }}>Scan to ring</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div style={{ padding: `${0.12 * k}in`, border: `${3 * k}pt solid #000`, borderRadius: `${0.12 * k}in` }}>
                <QRCode value={visitorUrl} level="M" style={{ width: `${4.2 * k}in`, height: `${4.2 * k}in` }} />
              </div>
              <p className="font-mono break-all" style={{ fontSize: `${8 * k}pt`, maxWidth: `${6 * k}in` }}>{visitorUrl}</p>
            </div>
            <p className="font-bold" style={{ fontSize: `${22 * k}pt` }}>We can’t hear knocking. Ring and someone will come.</p>
          </div>
          <div style={{ height: `${0.3 * k}in`, backgroundImage: STRIPES(brand), ...PRINT_EXACT }} />
        </div>
      </div>
    </div>
  )
}

// ── Staff join card ───────────────────────────────────────────────────────────

function StaffCardFace({ brand, stationName, joinUrl, joinCode, typeUrl, scale }: {
  brand: Brand; stationName: string; joinUrl: string; joinCode: string; typeUrl: string; scale: number
}) {
  const k = scale
  return (
    <div className="flex h-full w-full flex-col bg-white text-black" style={PRINT_EXACT}>
      <div style={{ height: `${0.12 * k}in`, backgroundImage: STRIPES(brand), ...PRINT_EXACT }} />
      <div className="flex flex-1 items-center" style={{ gap: `${0.14 * k}in`, padding: `${0.1 * k}in ${0.14 * k}in` }}>
        <QRCode value={joinUrl} level="M" style={{ width: `${1.35 * k}in`, height: `${1.35 * k}in`, flexShrink: 0 }} />
        <div className="min-w-0 text-left">
          <p className="font-black uppercase leading-tight" style={{ fontSize: `${10 * k}pt` }}>Turn your phone into the door alert</p>
          <p className="mt-0.5 font-semibold" style={{ fontSize: `${7.5 * k}pt` }}>{stationName} · {brand.orgName}</p>
          <p className="font-mono font-bold tracking-wider" style={{ fontSize: `${13 * k}pt`, marginTop: `${0.06 * k}in` }}>{joinCode}</p>
          <p style={{ fontSize: `${6 * k}pt` }}>Scan, or type the code at {typeUrl.replace(/^https?:\/\//, '')}</p>
          <p className="italic" style={{ fontSize: `${5.5 * k}pt`, marginTop: `${0.04 * k}in` }}>Staff only. Keep in the door kit; don’t post it.</p>
        </div>
      </div>
    </div>
  )
}

export function StaffCard({ brand, stationName, joinUrl, joinCode, typeUrl }: {
  brand: Brand; stationName: string; joinUrl: string; joinCode: string; typeUrl: string
}) {
  const [size, setSize] = useState<'cards' | 'half'>('cards')
  const printer = usePrintOrShare('Print / Save as PDF')
  const face = { brand, stationName, joinUrl, joinCode, typeUrl }

  return (
    <div>
      <style>{`${size === 'cards' ? '@page { size: 8.5in 11in; margin: 0 }' : '@page { size: 5.5in 8.5in; margin: 0 }'} ${PIN_FOR_PRINT}`}</style>
      <Toolbar onPrint={printer.print} busy={printer.busy} label={printer.label}>
        <SizePicker value={size} onChange={setSize} options={[{ value: 'cards', label: '8 business cards (Letter)' }, { value: 'half', label: 'Half letter' }]} />
      </Toolbar>
      <p className="mb-3 text-sm text-gray-600 print:hidden">
        Anyone with this card can pair a device and see visitors’ first names. Making a new staff code (Door Alert settings) stops old cards working.
      </p>
      <div className="overflow-x-auto print:overflow-visible">
        {size === 'cards' ? (
          <div data-print-root className="mx-auto bg-white shadow print:shadow-none" style={{ width: '8.5in', height: '11in', padding: '0.5in 0.75in', ...PRINT_EXACT }}>
            <div className="grid grid-cols-2" style={{ gridTemplateRows: 'repeat(4, 2in)', gridTemplateColumns: 'repeat(2, 3.5in)', rowGap: '0.25in' }}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} style={{ outline: '0.5pt dashed #9ca3af' }}>
                  <StaffCardFace {...face} scale={1} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div data-print-root className="mx-auto bg-white shadow print:shadow-none flex items-center" style={{ width: '5.5in', height: '8.5in', padding: '0.4in', ...PRINT_EXACT }}>
            <div style={{ width: '4.7in', height: '2.7in', outline: '0.5pt dashed #9ca3af' }}>
              <StaffCardFace {...face} scale={1.34} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
