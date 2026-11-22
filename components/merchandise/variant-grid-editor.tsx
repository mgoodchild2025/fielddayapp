'use client'

import { useState } from 'react'
import Image from 'next/image'
import { optionKey } from '@/lib/merch-options'

/** Colour × size options: colours, sizes, stock per combination, photo per colour. */
export type GridDraft = {
  colours: string[]
  sizes: string[]
  /** `${colour}|${size}` (either side may be '') → stock text; blank = unlimited. */
  stock: Record<string, string>
  /** colour → one of the item's photo urls. */
  colourImages: Record<string, string>
}

export const cellKey = (colour: string | null, size: string | null) => `${colour ?? ''}|${size ?? ''}`

const STANDARD_SIZES = ['S', 'M', 'L', 'XL']

/** Moves stock between keys when an axis appears or disappears (e.g. the first colour is added). */
function rekey(draft: GridDraft, colours: string[], sizes: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const cs = colours.length ? colours : [null]
  const ss = sizes.length ? sizes : [null]
  for (const c of cs) for (const s of ss) {
    const k = cellKey(c, s)
    out[k] = draft.stock[k]
      // The first colour inherits a size-only stock count; the first size a colour-only one.
      ?? (c !== null && colours.length === 1 ? draft.stock[cellKey(null, s)] : undefined)
      ?? (s !== null && sizes.length === 1 ? draft.stock[cellKey(c, null)] : undefined)
      ?? ''
  }
  return out
}

function ChipInput({
  label, values, onChange, placeholder, extra,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  extra?: React.ReactNode
}) {
  const [text, setText] = useState('')
  function add() {
    const parts = text.split(',').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean)
    const next = [...values]
    for (const p of parts) if (!next.some((v) => optionKey(v) === optionKey(p))) next.push(p.slice(0, 40))
    onChange(next)
    setText('')
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-gray-100 pl-3 pr-1 min-h-8 text-sm text-gray-800">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="press w-7 h-7 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50"
              aria-label={`Remove ${v}`}
            >×</button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-gray-400 py-1.5">None yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          aria-label={`Add ${label.toLowerCase()}`}
          className="flex-1 min-w-0 min-h-10 border rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
        />
        <button type="button" onClick={add} disabled={!text.trim()}
          className="press min-h-10 px-3 rounded-md border text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          Add
        </button>
        {extra}
      </div>
    </div>
  )
}

export function VariantGridEditor({
  draft, onChange, photos,
}: {
  draft: GridDraft
  onChange: (next: GridDraft) => void
  /** The item's own photos (main + gallery) — a colour can point at one. */
  photos: string[]
}) {
  const setAxes = (colours: string[], sizes: string[]) => {
    const colourImages = Object.fromEntries(Object.entries(draft.colourImages).filter(([c]) => colours.includes(c)))
    onChange({ colours, sizes, stock: rekey(draft, colours, sizes), colourImages })
  }
  const rows = draft.colours.length ? draft.colours : [null]
  const cols = draft.sizes.length ? draft.sizes : [null]
  const hasCells = draft.colours.length > 0 || draft.sizes.length > 0

  return (
    <div className="space-y-4">
      <ChipInput
        label="Colours"
        values={draft.colours}
        onChange={(c) => setAxes(c, draft.sizes)}
        placeholder="e.g. Black, White, Navy"
      />
      <ChipInput
        label="Sizes"
        values={draft.sizes}
        onChange={(s) => setAxes(draft.colours, s)}
        placeholder="e.g. S, M, L"
        extra={draft.sizes.length === 0 ? (
          <button type="button" onClick={() => setAxes(draft.colours, STANDARD_SIZES)}
            className="press min-h-10 px-3 rounded-md border text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap">
            S–XL
          </button>
        ) : null}
      />

      {hasCells && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Stock <span className="font-normal normal-case tracking-normal">(blank = unlimited)</span></p>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="text-sm border-separate border-spacing-1">
              {draft.sizes.length > 0 && (
                <thead>
                  <tr>
                    {draft.colours.length > 0 && <th />}
                    {cols.map((s) => <th key={s} scope="col" className="px-1 text-xs font-semibold text-gray-600">{s}</th>)}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((c) => (
                  <tr key={c ?? '-'}>
                    {draft.colours.length > 0 && <th scope="row" className="pr-2 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">{c}</th>}
                    {cols.map((s) => {
                      const k = cellKey(c, s)
                      return (
                        <td key={k}>
                          <input
                            type="number" inputMode="numeric" min={0}
                            value={draft.stock[k] ?? ''}
                            onChange={(e) => onChange({ ...draft, stock: { ...draft.stock, [k]: e.target.value } })}
                            placeholder="∞"
                            aria-label={`Stock for ${[c, s].filter(Boolean).join(' ')}`}
                            className="w-16 min-h-10 border rounded-md px-2 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {draft.colours.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Photo for each colour <span className="font-normal normal-case tracking-normal">(optional)</span></p>
          {photos.length === 0 ? (
            <p className="text-xs text-gray-500">Add photos above, then tap one to show it when a shopper picks that colour.</p>
          ) : (
            <div className="space-y-2">
              {draft.colours.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-sm text-gray-700">{c}</span>
                  <div className="flex gap-1.5 overflow-x-auto">
                    {photos.map((url) => {
                      const on = draft.colourImages[c] === url
                      return (
                        <button
                          key={url}
                          type="button"
                          onClick={() => {
                            const next = { ...draft.colourImages }
                            if (on) delete next[c]; else next[c] = url
                            onChange({ ...draft, colourImages: next })
                          }}
                          aria-pressed={on}
                          aria-label={`Use this photo for ${c}`}
                          className={`press relative w-11 h-11 shrink-0 rounded-md overflow-hidden border-2 ${on ? 'border-brand-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}
                        >
                          <Image src={url} alt="" fill sizes="44px" className="object-cover" unoptimized />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
